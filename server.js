<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>AWS AI Visual Assessor</title>
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- React & ReactDOM (Production Browser Build) -->
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <!-- Babel Standalone (runs modern JSX directly in Mobile Safari) -->
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <!-- QR Code Generator -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

  <style>
    body {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      background-color: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .tap-highlight-transparent {
      -webkit-tap-highlight-color: transparent;
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel">
    const { useState, useEffect, useRef } = React;

    // --- MAIN APP ROUTER / CONTROLLER ---
    function App() {
      const [role, setRole] = useState(null); // 'controller' | 'observer'
      const [sessionId, setSessionId] = useState('');

      useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlRole = params.get('role');
        const urlSession = params.get('session');
        if (urlRole) setRole(urlRole);
        if (urlSession) setSessionId(urlSession.toUpperCase());
      }, []);

      if (!role) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[90vh] px-6 text-center">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
              <svg className="w-9 h-9 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">AWS Visual Exam Assistant</h1>
            <p className="text-slate-400 text-sm mb-8">Two-iPhone visual assessment system using Gemini 2.5 Multimodal</p>

            <div className="w-full max-w-xs space-y-4">
              <button
                onClick={() => setRole('controller')}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-slate-950 font-bold rounded-xl shadow-md tap-highlight-transparent flex flex-col items-center"
              >
                <span className="text-base">Start as Controller</span>
                <span className="text-xs font-medium opacity-80">(iPhone 11)</span>
              </button>

              <button
                onClick={() => setRole('observer')}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white font-bold rounded-xl border border-slate-700 tap-highlight-transparent flex flex-col items-center"
              >
                <span className="text-base">Join as Observer Camera</span>
                <span className="text-xs text-slate-400 font-medium">(iPhone 16 Pro)</span>
              </button>
            </div>
          </div>
        );
      }

      if (role === 'observer') {
        return <ObserverView initialSessionId={sessionId} onBack={() => setRole(null)} />;
      }

      return <ControllerView onBack={() => setRole(null)} />;
    }

    // --- PHONE 1: OBSERVER (iPhone 16 Pro) ---
    function ObserverView({ initialSessionId, onBack }) {
      const [sessionId, setSessionId] = useState(initialSessionId || '');
      const [isJoined, setIsJoined] = useState(false);
      const [cameraStatus, setCameraStatus] = useState('Initializing...');
      const [isCapturing, setIsCapturing] = useState(false);
      const [flashEffect, setFlashEffect] = useState(false);
      const [statusNote, setStatusNote] = useState('Keep in foreground');

      const videoRef = useRef(null);
      const canvasRef = useRef(null);
      const pollTimerRef = useRef(null);
      const wakeLockRef = useRef(null);

      // Safari Screen Wake-Lock to prevent screen auto-lock
      const requestWakeLock = async () => {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            wakeLockRef.current.addEventListener('release', () => {
              console.log('Screen Wake Lock released');
            });
          }
        } catch (err) {
          console.warn('Wake Lock error:', err);
        }
      };

      useEffect(() => {
        requestWakeLock();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') requestWakeLock();
        });
        return () => {
          if (wakeLockRef.current) wakeLockRef.current.release();
        };
      }, []);

      // Initialize Camera: iPhone rear camera configuration
      const startCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
            audio: false
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute('playsinline', 'true');
            await videoRef.current.play();
            setCameraStatus('Live (Ready)');
          }
        } catch (err) {
          console.error('Camera error:', err);
          setCameraStatus('Permission Denied / Unavailable');
        }
      };

      const joinSession = async () => {
        if (!sessionId) return;
        try {
          const res = await fetch(`/api/session/${sessionId.toUpperCase()}/observer-join`, { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            setIsJoined(true);
            await startCamera();
            startPolling();
          } else {
            alert(data.error || 'Failed to join');
          }
        } catch (err) {
          alert('Cannot connect to server.');
        }
      };

      // Poll for Controller capture trigger
      const startPolling = () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);

        pollTimerRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/session/${sessionId.toUpperCase()}/observer-poll`);
            if (res.status === 404) {
              setStatusNote('Session Ended');
              clearInterval(pollTimerRef.current);
              return;
            }
            const data = await res.json();

            if (data.shouldCapture && !isCapturing) {
              executeCapture();
            }
          } catch (e) {
            console.warn('Polling error', e);
          }
        }, 800); // 800ms low-latency polling
      };

      useEffect(() => {
        if (initialSessionId) {
          joinSession();
        }
        return () => clearInterval(pollTimerRef.current);
      }, [initialSessionId]);

      // Take high-resolution still image & upload
      const executeCapture = () => {
        setIsCapturing(true);
        setFlashEffect(true);
        setTimeout(() => setFlashEffect(false), 250);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64Image = canvas.toDataURL('image/jpeg', 0.85);

        setStatusNote('Uploading image to Gemini...');
        fetch(`/api/session/${sessionId.toUpperCase()}/upload-capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64 })
        })
          .then(res => res.json())
          .then(() => {
            setStatusNote('Analysis running on Controller');
          })
          .catch(() => {
            setStatusNote('Upload failed');
          })
          .finally(() => {
            setIsCapturing(false);
          });
      };

      return (
        <div className="relative h-screen w-screen overflow-hidden bg-black flex flex-col justify-between">
          {/* Flash Effect on Capture */}
          {flashEffect && <div className="absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-200"></div>}

          {/* Top Floating Status Bar */}
          <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/50">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">Observer (16 Pro)</span>
              </div>
              <p className="text-[11px] text-slate-400">Code: <strong className="text-amber-400 font-mono">{sessionId || '—'}</strong></p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-emerald-400">{cameraStatus}</span>
              <p className="text-[10px] text-slate-400">{statusNote}</p>
            </div>
          </div>

          {!isJoined ? (
            <div className="flex-1 flex flex-col justify-center items-center px-6 z-30 bg-slate-950">
              <div className="w-full max-w-xs space-y-4">
                <h2 className="text-xl font-bold text-center">Connect Camera</h2>
                <input
                  type="text"
                  maxLength="6"
                  placeholder="Enter 6-char Code"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                  className="w-full py-3 px-4 bg-slate-900 border border-slate-700 rounded-xl text-center text-2xl font-mono uppercase tracking-widest text-amber-400 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={joinSession}
                  className="w-full py-3.5 bg-amber-500 text-slate-950 font-bold rounded-xl active:scale-95 transition-all"
                >
                  Join Controller
                </button>
                <button onClick={onBack} className="w-full py-2 text-slate-500 text-xs">Back</button>
              </div>
            </div>
          ) : (
            <>
              {/* Camera Preview */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover z-0"
              />

              {/* Target Aim Reticle */}
              <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                <div className="w-[85%] h-[60%] border border-white/30 rounded-2xl relative">
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg"></div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg"></div>
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg"></div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg"></div>
                  <p className="absolute -bottom-7 w-full text-center text-[11px] font-medium text-white/70">Align Practice Question Inside Frame</p>
                </div>
              </div>

              {/* Hidden Canvas for High-Resolution Capture */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Bottom Notification bar */}
              <div className="absolute bottom-6 left-6 right-6 z-20 text-center">
                <div className="inline-block bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-800 text-xs text-slate-300">
                  {isCapturing ? 'Capturing Still Frame...' : 'Standing by for Controller trigger'}
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    // --- PHONE 2: CONTROLLER (iPhone 11) ---
    function ControllerView({ onBack }) {
      const [sessionId, setSessionId] = useState('');
      const [isObserverConnected, setIsObserverConnected] = useState(false);
      const [isCapturing, setIsCapturing] = useState(false);
      const [latestCapture, setLatestCapture] = useState(null);
      const [historyCount, setHistoryCount] = useState(0);
      const [sessionReport, setSessionReport] = useState(null);
      const [viewingHistory, setViewingHistory] = useState(false);
      const [historyList, setHistoryList] = useState([]);

      const qrRef = useRef(null);
      const pollRef = useRef(null);

      // Create new session
      const createSession = async () => {
        try {
          const res = await fetch('/api/session/create', { method: 'POST' });
          const data = await res.json();
          if (data.sessionId) {
            setSessionId(data.sessionId);
          }
        } catch (err) {
          alert('Could not start session.');
        }
      };

      useEffect(() => {
        createSession();
      }, []);

      // Render pairing QR Code
      useEffect(() => {
        if (sessionId && qrRef.current) {
          qrRef.current.innerHTML = '';
          const joinUrl = `${window.location.origin}/?role=observer&session=${sessionId}`;
          new QRCode(qrRef.current, {
            text: joinUrl,
            width: 140,
            height: 140,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }, [sessionId]);

      // Smart Battery-Efficient Controller Poller
      // Polls fast (1s) when waiting for analysis; throttles (2.5s) when idle
      useEffect(() => {
        if (!sessionId || sessionReport) return;

        const pollBackend = async () => {
          try {
            const res = await fetch(`/api/session/${sessionId}/controller-poll`);
            if (res.ok) {
              const data = await res.json();
              setIsObserverConnected(data.isObserverConnected);
              setLatestCapture(data.latestCapture);
              setHistoryCount(data.historyCount);

              if (data.latestCapture && !data.latestCapture.isAnalyzing) {
                setIsCapturing(false);
              }
            }
          } catch (e) {
            console.warn('Controller poll error');
          }
        };

        const intervalMs = isCapturing ? 1000 : 2500;
        pollRef.current = setInterval(pollBackend, intervalMs);

        return () => clearInterval(pollRef.current);
      }, [sessionId, isCapturing, sessionReport]);

      // Trigger capture on Observer
      const handleTriggerCapture = async () => {
        if (!isObserverConnected) {
          alert('Waiting for Observer (iPhone 16 Pro) to pair and activate camera.');
          return;
        }
        setIsCapturing(true);
        try {
          const res = await fetch(`/api/session/${sessionId}/trigger-capture`, { method: 'POST' });
          const data = await res.json();
          if (!data.success) {
            alert(data.error);
            setIsCapturing(false);
          }
        } catch (e) {
          alert('Capture request failed');
          setIsCapturing(false);
        }
      };

      // End session and show summary
      const handleEndSession = async () => {
        if (!confirm('End assessment and review report?')) return;
        try {
          const res = await fetch(`/api/session/${sessionId}/end`, { method: 'POST' });
          const data = await res.json();
          setSessionReport(data);
          setHistoryList(data.history);
        } catch (e) {
          alert('Error ending session');
        }
      };

      if (sessionReport) {
        return (
          <div className="min-h-screen bg-slate-950 p-5 pb-12 overflow-y-auto">
            <h1 className="text-2xl font-bold text-white mb-1">Session Report</h1>
            <p className="text-xs text-slate-400 mb-6 font-mono">Session ID: {sessionId}</p>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 flex justify-around text-center">
              <div>
                <p className="text-xs text-slate-400">Total Scanned</p>
                <p className="text-2xl font-extrabold text-amber-400">{sessionReport.totalQuestions}</p>
              </div>
              <div className="border-r border-slate-800"></div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <p className="text-2xl font-extrabold text-emerald-400">Finished</p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Analyzed Questions</h2>
              {sessionReport.history.map((item, idx) => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Question #{sessionReport.history.length - idx}</span>
                    <span>{item.timestamp}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200">{item.analysis?.questionText || 'Image Question'}</p>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                    <p className="font-semibold text-amber-400">Choice: {item.analysis?.recommendedChoice}</p>
                    <p className="text-slate-300 mt-1">{item.analysis?.architecturalReasoning}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="mt-8 w-full py-3.5 bg-amber-500 font-bold text-slate-950 rounded-xl"
            >
              Start New Assessment
            </button>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-between pb-8">
          {/* Header */}
          <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Controller (iPhone 11)</span>
              <h2 className="text-lg font-bold font-mono text-amber-400">{sessionId || 'Generating...'}</h2>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${isObserverConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-xs font-medium text-slate-300">
                {isObserverConnected ? 'Observer Linked' : 'Awaiting 16 Pro'}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {/* Pairing QR Section (Displays until connected) */}
            {!isObserverConnected && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center flex flex-col items-center">
                <p className="text-sm font-semibold text-white mb-1">Scan to Pair Observer (iPhone 16 Pro)</p>
                <p className="text-xs text-slate-400 mb-4">Point your iPhone 16 Pro camera at this QR code</p>
                <div className="p-2 bg-white rounded-xl shadow-md inline-block mb-3" ref={qrRef}></div>
                <p className="text-xs font-mono text-slate-400">Or enter code manually: <span className="text-amber-400 font-bold">{sessionId}</span></p>
              </div>
            )}

            {/* AI Analysis Result Card */}
            {latestCapture && latestCapture.isAnalyzing && (
              <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-2xl text-center space-y-3">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm font-semibold text-amber-400">Analyzing AWS Architecture...</p>
                <p className="text-xs text-slate-400">Examining question, multiple choices, and well-architected tradeoffs.</p>
              </div>
            )}

            {latestCapture && !latestCapture.isAnalyzing && latestCapture.analysis && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold uppercase text-amber-500">Gemini Assessment</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                    latestCapture.analysis.confidence === 'High' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {latestCapture.analysis.confidence} Confidence
                  </span>
                </div>

                {latestCapture.imageBase64 && (
                  <img
                    src={latestCapture.imageBase64}
                    alt="Captured question"
                    className="w-full h-36 object-cover rounded-xl border border-slate-800"
                  />
                )}

                <div>
                  <p className="text-xs text-slate-400 font-medium">Identified Question:</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{latestCapture.analysis.questionText}</p>
                </div>

                {latestCapture.analysis.options?.length > 0 && (
                  <div className="space-y-1.5">
                    {latestCapture.analysis.options.map((opt, i) => (
                      <div key={i} className="text-xs p-2 bg-slate-950 rounded-lg text-slate-300 border border-slate-800/80">
                        <strong className="text-amber-400 mr-1.5">{opt.label}:</strong> {opt.text}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl">
                  <p className="text-xs font-bold text-amber-400">Recommended Choice:</p>
                  <p className="text-base font-extrabold text-white">{latestCapture.analysis.recommendedChoice}</p>
                </div>

                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-1">Architectural Reasoning:</p>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
                    {latestCapture.analysis.architecturalReasoning}
                  </p>
                </div>

                {latestCapture.analysis.caveatsOrUncertainty && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-rose-900/40 text-[11px] text-slate-400">
                    <strong className="text-rose-400">Assessment Note: </strong>
                    {latestCapture.analysis.caveatsOrUncertainty}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controller Bottom Actions */}
          <div className="px-4 pt-2 space-y-3">
            <button
              disabled={!isObserverConnected || isCapturing}
              onClick={handleTriggerCapture}
              className={`w-full py-4 rounded-2xl font-extrabold text-base transition-all tap-highlight-transparent shadow-lg flex items-center justify-center space-x-2 ${
                !isObserverConnected || isCapturing
                  ? 'bg-slate-800 text-slate-500 border border-slate-700'
                  : 'bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 shadow-amber-500/20'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span>{isCapturing ? 'Capturing & Analyzing...' : 'Capture Practice Question'}</span>
            </button>

            <div className="flex justify-between items-center px-1">
              <span className="text-xs text-slate-400">Questions Logged: <strong className="text-white font-mono">{historyCount}</strong></span>
              <button
                disabled={historyCount === 0}
                onClick={handleEndSession}
                className="text-xs font-semibold text-rose-400 disabled:text-slate-600"
              >
                End Session & Report
              </button>
            </div>
          </div>
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>

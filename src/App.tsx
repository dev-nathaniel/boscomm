import { useState, useRef, useEffect, useCallback } from 'react'
import { socket } from './socket';
import * as Mediasoup from 'mediasoup-client'
import './App.css'

function App() {
  const fsPublish = useRef<HTMLFieldSetElement>(null);
  const fsSubscribe = useRef<HTMLFieldSetElement>(null);
  const fsConnection = useRef<HTMLFieldSetElement>(null);
  const webcamStatus = useRef<HTMLSpanElement>(null);
  const screenStatus = useRef<HTMLSpanElement>(null);
  const connectionStatus = useRef<HTMLSpanElement>(null);
  const subStatus = useRef<HTMLSpanElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const btnConnect = useRef<HTMLButtonElement>(null);
  const btnWebcam = useRef<HTMLButtonElement>(null);
  const btnScreen = useRef<HTMLButtonElement>(null);
  const btnSubscribe = useRef<HTMLButtonElement>(null);
  const chkSimulcast = useRef<HTMLInputElement>(null);

  const [device, setDevice] = useState<Mediasoup.types.Device>();
  const rtpCapabilities = useRef<Mediasoup.types.RtpCapabilities>({});
  // const [socket, setSocket] = useState();
  const [producer, setProducer] = useState<Mediasoup.types.Producer>();
  const [pubStatus, setPubStatus] = useState<HTMLSpanElement | null>(null);
  // const [isConnected, setIsConnected] = useState(socket.connected);
  // const [stream, setStream] = useState<MediaStream>();

  useEffect(() => {
    if (typeof navigator.mediaDevices.getDisplayMedia === 'undefined') {
      console.error('getDisplayMedia is not supported in this browser.');
      screenStatus.current!.textContent = 'Screen sharing not supported';
      btnScreen.current!.disabled = true;
    }
  });

  useEffect(() => {
(async () => {
    if (device) {
      console.log('Device already initialized');
    await device?.load({ routerRtpCapabilities: rtpCapabilities.current });
      return;
    }
  })();
    
  }, [device]);

  async function loadDevice() {
    try {
      setDevice(new Mediasoup.Device());
    } catch (error) {
      if (error.name === 'UnsupportedError') {
        console.error('Browser not supported');
        
      }
    }
  }
  useEffect(() => {
    console.log('Initializing socket connection');
    if (fsConnection.current && connectionStatus.current) {
        fsConnection.current.disabled = true;
        connectionStatus.current.textContent = 'Connecting...';
      }
    const handleConnect = async () => {
      console.log('Socket connected');
      if (connectionStatus.current) {
        connectionStatus.current.textContent = 'Connected';
      }
      if (fsPublish.current) {
        fsPublish.current.disabled = false;
      }
      if (fsSubscribe.current) {
        fsSubscribe.current.disabled = false;
      }
      const respose = await socket.emitWithAck('getRouterRtpCapabilities');
      rtpCapabilities.current = respose.rtpCapabilities;
      console.log('RTP Capabilities:', rtpCapabilities.current);
      await loadDevice();
    };

    socket.on('connect', handleConnect);

    // If already connected, call handler immediately
    if (socket.connected) {
      handleConnect();
    }

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        // setIsConnected(false);
        if (connectionStatus.current) {
          connectionStatus.current.textContent = 'Disconnected';
        }
        if (fsPublish.current) {
          fsPublish.current.disabled = true;
        }
        if (fsSubscribe.current) {
          fsSubscribe.current.disabled = true;
        }
        if (btnConnect.current) {
          btnConnect.current.disabled = false;
        }
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        if (connectionStatus.current) {
          connectionStatus.current.textContent = 'Connection failed';
        }
        if (btnConnect.current) {
          btnConnect.current.disabled = false;
        }
      });

      socket.on('newProducer', (producer) => {
        console.log('New producer:', producer);
        if (fsSubscribe.current) {
          fsSubscribe.current.disabled = false;
        }
      });
      return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('newProducer');
      }
    }, []);
  useEffect(() => {
    btnConnect.current?.addEventListener('click', async () => {
      if (fsConnection.current && connectionStatus.current) {
        fsConnection.current.disabled = true;
        connectionStatus.current.textContent = 'Connecting...';
      }
    });

    return () => {
      
    };
  }, []);

  const getUserMedia = useCallback(async( isWebcam: boolean) =>{
    if (!device?.canProduce('video')) {
      console.error('Cannot produce video');
      return;
    }
    let stream: MediaStream;
    try {
      stream = (isWebcam ? await navigator.mediaDevices.getUserMedia({ video: true }) : await navigator.mediaDevices.getDisplayMedia({ video: true }));
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
    return stream;
  }, [device])

  useEffect(() => {
    btnWebcam.current?.addEventListener('click', async (e) => {
      const isWebcam = (e.target as HTMLButtonElement).id === 'btn_webcam';
      setPubStatus(isWebcam ? webcamStatus.current : screenStatus.current);
      const response = await socket.emitWithAck('createProducerTransport', { forceTcp: false, rtpCapabilities: device?.rtpCapabilities });
      console.log('Transport response:', response);
      if (response?.error) {
        console.error('Error creating transport:', response.error);
        return;
      }
      const transport = device?.createSendTransport(response);
      transport?.on('connect', async ({ dtlsParameters }, callback, errback) => {
        console.log('Transport connect:', dtlsParameters);
        const response = await socket.emitWithAck('connectProducerTransport', { dtlsParameters });
        if (response?.error) {
          console.error('Error connecting transport:', response.error);
          errback(response.error);
        } else {
          console.log('Transport connected');
          callback();
        }
      });

      transport?.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        console.log('Producing:', kind, rtpParameters);
        try {
          const response = await socket.emitWithAck('produce', { transportId: transport.id, kind, rtpParameters });
          if (response?.error) {
            console.error('Error producing:', response.error);
            errback(response.error);
          } else {
            console.log('Produced successfully:', response.id);
          callback( response.id );
          }
        } catch (error) {
          console.error('Error producing:', error);
        }
      });

      transport?.on('connectionstatechange', (state) => {
        switch (state) {
          case 'connecting':
            console.log('Transport connecting');
            if (pubStatus) {
              pubStatus.textContent = 'publishing...';
            }
            if (fsPublish.current) {
              fsPublish.current.disabled = true;
            }
            if (fsSubscribe.current) {
              fsSubscribe.current.disabled = true;
            }
            break;
          case 'connected':
            console.log('Transport connected');
            if (localVideo.current && stream) {
              localVideo.current.srcObject = stream;
            }
            if (pubStatus) {
              pubStatus.textContent = 'published';
            }
            if (fsPublish.current) {
              fsPublish.current.disabled = true;
            }
            if (fsSubscribe.current) {
              fsSubscribe.current.disabled = false;
            }
            break;
          case 'failed':
            console.error('Transport failed');
            transport.close();
            if (pubStatus) {
              pubStatus.textContent = 'failed';
            }
            if (fsPublish.current) {
              fsPublish.current.disabled = false;
            }
            if (fsSubscribe.current) {
              fsSubscribe.current.disabled = true;
            }
            break;

          default: break;
        }
      });
      let stream: MediaStream | undefined;
      try {
        if (transport) {
          stream = await getUserMedia( isWebcam);
          // setStream(mediaStream);
          const track = stream?.getVideoTracks()[0];
          const params: Mediasoup.types.ProducerOptions = { track };
          if (chkSimulcast.current?.checked) {
            params.encodings = [
              { maxBitrate: 100000 },
              { maxBitrate: 300000 },
              { maxBitrate: 900000 }
            ];
            params.codecOptions = {
              videoGoogleStartBitrate: 1000, // Optional: Set initial bitrate for simulcast
            }
          }
          const producer = await transport.produce(params);
          setProducer(producer);
        } 
      }catch (error) {
          console.error('Error accessing media devices:', error);
          if (pubStatus) {
            pubStatus.textContent = 'Error accessing media devices';
          }
        }
    });
  }, [device, getUserMedia, pubStatus]);

  

  const consume = useCallback(async (transport: Mediasoup.types.Transport) => {
    if (device) {
      const { rtpCapabilities } = device;
      const data = await socket.emitWithAck('consume', { rtpCapabilities });
      const { producerId, id, kind, rtpParameters } = data;
      console.log('Consuming:', producerId, id, kind, rtpParameters);

      // const codecOptions = {};
      const consumer = await transport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
        // appData: { mediaTag: 'video' },
        // codecOptions
      });
      const stream = new MediaStream();
      stream.addTrack(consumer.track);
      return stream;
    }
  }, [device]);


  useEffect(() => {
    btnSubscribe.current?.addEventListener('click', async () => {
      const data = await socket.emitWithAck('createConsumerTransport', { forceTcp: false});
      if (data.error) {
        console.error('Error creating consumer transport:', data.error);
        return;
      }

      const transport = device?.createRecvTransport(data);
      transport?.on('connect', async ({ dtlsParameters }, callback, errback) => {
        console.log('Consumer transport connect:', dtlsParameters);
        const response = await socket.emitWithAck('connectConsumerTransport', { dtlsParameters });
        if (response?.error) {
          console.error('Error connecting consumer transport:', response.error);
          errback(response.error);
        } else {
          console.log('Consumer transport connected');
          callback();
        }
      });

      transport?.on('connectionstatechange', async (state) => {
        switch (state) {
          case 'connecting':
            console.log('Consumer transport connecting');
            if (subStatus.current) {
              subStatus.current.textContent = 'subscribing...';
            }
            if (fsSubscribe.current) {
              fsSubscribe.current.disabled = true;
            }
            break;
          case 'connected':
            console.log('Consumer transport connected');
            if (remoteVideo.current) {
              const mediaStream = await stream;
              if (mediaStream) {
                remoteVideo.current.srcObject = mediaStream;
              }
            }
            await socket.emitWithAck('resume');
            if (subStatus.current) {
              subStatus.current.textContent = 'subscribed';
            }
            if (fsSubscribe.current) {
              fsSubscribe.current.disabled = true;
            }
            break;
          case 'failed':
            console.error('Consumer transport failed');
            transport.close();
            if (subStatus.current) {
              subStatus.current.textContent = 'failed';
            }
            if (fsSubscribe.current) {
              fsSubscribe.current.disabled = false;
            }
            break;

          default: break;
        }
      });
      let stream: Promise<MediaStream | undefined>;
      if (transport) {        
      stream = consume(transport);
      }
    }
    );
  }, [device, consume]);


  
  return (
    <>
      {/* <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p> */}
      <table>
        <tr>
          <td>
            <div>Local</div>
            <video ref={localVideo} id="local_video" controls autoPlay playsInline></video>
          </td>
          <td>
            <div>Remote</div>
            <video ref={remoteVideo} id="remote_video" controls autoPlay playsInline></video>
          </td>
        </tr>
      </table>
      <br />
      <table>
        <tr>
          <td>
            <fieldset ref={fsConnection} id='fs_connection'>
              <legend>Connection</legend>
              <div><button ref={btnConnect} id='btn_connect'>Connect</button> <span ref={connectionStatus} id='connection_status'></span></div>
            </fieldset>
          </td>
          <td>
            <fieldset ref={fsPublish} id='fs_publish' disabled>
              <legend>Publishing</legend>
              <div><label><input ref={chkSimulcast} type='checkbox' id='chk_simulcast' /> Use Simulcast</label></div>
              <div>
                <button ref={btnWebcam} id='btn_webcam'>Start Webcam</button>
                <span ref={webcamStatus} id='webcam_status'></span>
              </div>
              <div>
                <button ref={btnScreen} id='btn_screen'>Share Screen</button>
                <span ref={screenStatus} id='screen_status'></span>
              </div>
            </fieldset>
          </td>
          <td>
            <fieldset ref={fsSubscribe} id='fs_subscribe' disabled>
              <legend>Subscription</legend>
              <div>
                <button ref={btnSubscribe} id='btn_subscribe'>Subscribe</button>
                <span ref={subStatus} id='sub_status'></span>
              </div>
            </fieldset>
          </td>
        </tr>
      </table>
    </>
  )
}

export default App

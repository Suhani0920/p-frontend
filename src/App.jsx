import React, { useState, useEffect, useRef } from 'react';
import * as signalR from "@microsoft/signalr";
import signalRConnection, { startSignalRConnection } from './services/signalRService';
import './App.css';

function App() {
  const [callStatus, setCallStatus] = useState('idle');
  const [incomingNumber, setIncomingNumber] = useState('');
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');

  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const signalRStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);

  useEffect(() => {
    startSignalRConnection();

    signalRConnection.on("IncomingCall", (phoneNumber) => {
      console.log(`Incoming call from: ${phoneNumber}`);
      setCallStatus('ringing');
      setIncomingNumber(phoneNumber);
      setCustomer(null);
      setError('');
      fetchCustomerDetails(phoneNumber);
    });

    return () => {
      signalRConnection.off("IncomingCall");
    };
  }, []);

  const fetchCustomerDetails = async (phoneNumber) => {
    try {
      const response = await fetch(`https://prop-backend-cszs.onrender.com/api/customers/lookup?phoneNumber=${phoneNumber}`);
      if (!response.ok) {
        throw new Error('Unknown Caller');
      }
      const data = await response.json();
      setCustomer(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // --- UPDATED: handleAnswer now uses AudioWorklet ---
  const handleAnswer = async () => {
    console.log("Answering call with modern AudioWorklet...");
    try {
      // 1. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // 2. Create AudioContext and load our custom processor
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      // *** THIS IS THE FIX: Use an absolute path for the deployed environment ***
      await audioContextRef.current.audioWorklet.addModule('/audio-processor.js');

      // 3. Create an instance of our worklet
      const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      audioWorkletNodeRef.current = workletNode;

      // 4. Connect the microphone stream to our worklet
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(workletNode);
      workletNode.connect(audioContextRef.current.destination); // Connect to speakers for monitoring if needed

      // 5. Create a SignalR subject to send audio to the server
      const subject = new signalR.Subject();
      signalRStreamRef.current = subject;
      
      // 6. Listen for messages (audio chunks) from the worklet
      workletNode.port.onmessage = (event) => {
        // Send the PCM audio data received from the worklet to the server
        subject.next(new Uint8Array(event.data));
      };

      // 7. Start the SignalR stream and subscribe to server responses
      const audioStream = signalRConnection.stream("ProcessVoiceStream", subject);
      audioStream.subscribe({
        next: (chunk) => {
          // This is the echoed audio from the server
          const pcm16 = new Int16Array(chunk.buffer);
          const float32 = new Float32Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32767;
          }
          const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, audioContextRef.current.sampleRate);
          audioBuffer.copyToChannel(float32, 0);
          const bufferSource = audioContextRef.current.createBufferSource();
          bufferSource.buffer = audioBuffer;
          bufferSource.connect(audioContextRef.current.destination);
          bufferSource.start();
        },
        complete: () => console.log("Server stream completed."),
        error: (err) => console.error("Server stream error:", err),
      });

      setCallStatus('active');
      console.log("Call is active. Modern audio pipeline is running.");
    } catch (err) {
      console.error("Failed to start audio stream:", err);
      setError("Could not access microphone.");
    }
  };

  const handleDecline = () => {
    console.log("Call declined");
    setCallStatus('idle');
    setIncomingNumber('');
    setCustomer(null);
    setError('');
  };

  const handleHangUp = () => {
    console.log("Hanging up call...");
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (signalRStreamRef.current) {
      signalRStreamRef.current.complete();
      signalRStreamRef.current = null;
    }
    // Disconnect the worklet node
    if (audioWorkletNodeRef.current) {
        audioWorkletNodeRef.current.disconnect();
        audioWorkletNodeRef.current = null;
    }
    setCallStatus('idle');
    setIncomingNumber('');
    setCustomer(null);
  };

  const renderCallControls = () => {
    switch (callStatus) {
      case 'ringing':
        return (
          <>
            <h2>Incoming Call</h2>
            <p className="phone-number">{incomingNumber}</p>
            <div className="button-group">
              <button onClick={handleAnswer} className="btn btn-answer">Answer</button>
              <button onClick={handleDecline} className="btn btn-decline">Decline</button>
            </div>
          </>
        );
      case 'active':
        return (
          <>
            <h2>Call in Progress</h2>
            <p className="phone-number">{customer?.name || incomingNumber}</p>
            <button onClick={handleHangUp} className="btn btn-hangup">Hang Up</button>
          </>
        );
      default:
        return (
          <>
            <h2>Live Call Status</h2>
            <p>Waiting for calls...</p>
          </>
        );
    }
  };

  return (
    <div className="container">
      <h1>PropVivo Support Portal</h1>
      <div className="portal-grid">
        <div className="call-control-panel">
          {renderCallControls()}
        </div>
        <div className="customer-info-panel">
          <h2>Customer Information</h2>
          {callStatus !== 'idle' && (
            <>
              {customer && (
                <div className="customer-data">
                  <p><strong>Name:</strong> {customer.name}</p>
                  <p><strong>Email:</strong> {customer.email}</p>
                  <p><strong>Phone:</strong> {customer.phoneNumber}</p>
                  <p><strong>Address:</strong> {customer.address || 'N/A'}</p>
                </div>
              )}
              {error && <p className="error-message">{error}</p>}
              {!customer && !error && callStatus === 'ringing' && <p>Searching...</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

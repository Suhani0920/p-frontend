import React, { useState, useEffect, useRef } from 'react';
import * as signalR from "@microsoft/signalr";
import signalRConnection, { startSignalRConnection } from './services/signalRService';
import './App.css';

function App() {
  const [callStatus, setCallStatus] = useState('idle');
  const [incomingNumber, setIncomingNumber] = useState('');
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');
  const [callId, setCallId] = useState('');
  const [joinCallId, setJoinCallId] = useState('');

  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const signalRStreamRef = useRef(null);

  useEffect(() => {
    startSignalRConnection();

    signalRConnection.on("IncomingCall", (phoneNumber) => {
      setCallStatus('ringing');
      setIncomingNumber(phoneNumber);
      fetchCustomerDetails(phoneNumber);
    });

    // Listen for audio chunks from the other party
    signalRConnection.on("ReceiveAudioChunk", (chunk, senderConnectionId) => {
      // IMPORTANT: Only play audio that is NOT from yourself.
      if (senderConnectionId !== signalRConnection.connectionId) {
        playAudioChunk(chunk);
      }
    });

    return () => {
      signalRConnection.off("IncomingCall");
      signalRConnection.off("ReceiveAudioChunk");
    };
  }, []);

  const fetchCustomerDetails = async (phoneNumber) => {
    try {
      const response = await fetch(`https://prop-backend-cszs.onrender.com/api/customers/lookup?phoneNumber=${phoneNumber}`);
      if (!response.ok) throw new Error('Unknown Caller');
      const data = await response.json();
      setCustomer(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const startAudioStreaming = async (currentCallId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      await audioContextRef.current.audioWorklet.addModule('audio-processor.js');

      const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      audioWorkletNodeRef.current = workletNode;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(workletNode);

      const subject = new signalR.Subject();
      signalRStreamRef.current = subject;

      workletNode.port.onmessage = (event) => {
        subject.next(new Uint8Array(event.data));
      };
      
      // Start broadcasting our audio to the server
      await signalRConnection.send("BroadcastAudioStream", currentCallId, subject);

      console.log("Audio streaming started for call:", currentCallId);
    } catch (err) {
      console.error("Failed to start audio stream:", err);
      setError("Could not access microphone.");
    }
  };

  const playAudioChunk = (chunk) => {
    if (!audioContextRef.current) return;
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
  };

  const handleAnswer = async () => {
    const newCallId = await signalRConnection.invoke("StartCallSession");
    setCallId(newCallId);
    setCallStatus('active');
    await startAudioStreaming(newCallId);
  };

  const handleJoinCall = async () => {
    if (!joinCallId) {
      alert("Please enter a Call ID.");
      return;
    }
    await signalRConnection.invoke("JoinCallSession", joinCallId);
    setCallId(joinCallId);
    setCallStatus('active_customer');
    await startAudioStreaming(joinCallId);
  };

  const stopAllAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (signalRStreamRef.current) {
      signalRStreamRef.current.complete();
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
    }
  };

  const handleDecline = () => {
    setCallStatus('idle');
  };

  const handleHangUp = () => {
    stopAllAudio();
    setCallStatus('idle');
    setCallId('');
  };
  
  // --- UI Rendering ---
  if (callStatus === 'active') { // Agent In-Call View
    return (
      <div className="container">
        <h1>Call in Progress</h1>
        <p>Share this Call ID with the customer: <strong>{callId}</strong></p>
        <div className="customer-info-panel">
          <h2>Customer: {customer?.name || incomingNumber}</h2>
        </div>
        <button onClick={handleHangUp} className="btn btn-hangup">Hang Up</button>
      </div>
    );
  }

  if (callStatus === 'active_customer') { // Customer In-Call View
    return (
      <div className="container">
        <h1>Call in Progress</h1>
        <p>Connected to Call ID: <strong>{callId}</strong></p>
        <button onClick={handleHangUp} className="btn btn-hangup">Hang Up</button>
      </div>
    );
  }

  // Agent Idle / Ringing View
  return (
    <div className="container">
      <h1>PropVivo Support Portal</h1>
      <div className="portal-grid">
        <div className="call-control-panel">
          {callStatus === 'ringing' ? (
            <>
              <h2>Incoming Call</h2>
              <p className="phone-number">{incomingNumber}</p>
              <div className="button-group">
                <button onClick={handleAnswer} className="btn btn-answer">Answer</button>
                <button onClick={handleDecline} className="btn btn-decline">Decline</button>
              </div>
            </>
          ) : (
            <>
              <h2>Agent Panel</h2>
              <p>Waiting for calls...</p>
            </>
          )}
        </div>
        <div className="customer-join-panel">
          <h2>Customer Panel</h2>
          <p>To join a call, enter the Call ID provided by the agent.</p>
          <input 
            type="text" 
            placeholder="Enter Call ID" 
            value={joinCallId}
            onChange={(e) => setJoinCallId(e.target.value)}
            className="call-id-input"
          />
          <button onClick={handleJoinCall} className="btn btn-join">Join Call</button>
        </div>
      </div>
    </div>
  );
}

export default App;
// This class handles audio processing in a separate thread.
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    // Get the audio data from the microphone input.
    const inputData = inputs[0][0];

    // If there is audio data, process it and send it to the main thread.
    if (inputData) {
      // Convert the 32-bit float audio data to 16-bit PCM.
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = inputData[i] * 32767;
      }
      // Post the raw PCM buffer back to the main App component.
      this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
    }

    // Return true to keep the processor alive.
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
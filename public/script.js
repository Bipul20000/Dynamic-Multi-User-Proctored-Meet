const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('localVideo');
const localCanvas = document.getElementById('localCanvas');
const muteButton = document.getElementById('muteButton');
const endCallButton = document.getElementById('endCallButton');
const peers = {};

let localStream;

console.log("Script loaded. Initializing...");

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

async function setupFaceDetection(videoEl, canvasEl) {
  const context = canvasEl.getContext('2d');
  
  setInterval(async () => {
    if (videoEl.paused || videoEl.ended) return;
    
    // ✅ THIS IS THE FIX: Wait until the video has a size
    if (videoEl.clientWidth === 0 || videoEl.clientHeight === 0) {
      return;
    }

    const displaySize = { width: videoEl.clientWidth, height: videoEl.clientHeight };
    faceapi.matchDimensions(canvasEl, displaySize);

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    const detections = await faceapi.detectAllFaces(videoEl, options).withFaceLandmarks();
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    
    context.clearRect(0, 0, canvasEl.width, canvasEl.height);
    faceapi.draw.drawDetections(canvasEl, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvasEl, resizedDetections);
  }, 150);
}

async function startLocalVideo() {
  console.log("Attempting to start local video and audio...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log("Local stream acquired.");
    localVideo.srcObject = stream;
    localVideo.addEventListener('loadedmetadata', () => {
      localVideo.play();
      console.log("Local video metadata loaded, setting up face detection.");
      setupFaceDetection(localVideo, localCanvas);
    });
    return stream;
  } catch (err) {
    console.error("Failed to get local stream", err);
  }
}

function createPeerConnection(targetSocketId) {
  console.log("Creating peer connection for target:", targetSocketId);
  const peer = new RTCPeerConnection(rtcConfig);
  peers[targetSocketId] = peer;

  peer.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice-candidate', { target: targetSocketId, candidate: event.candidate });
    }
  };

  peer.ontrack = event => {
    console.log("Received remote track from:", targetSocketId);
    addRemoteStream(event.streams[0], targetSocketId);
  };
  
  return peer;
}

function addRemoteStream(stream, socketId) {
  console.log("Adding remote stream to the page for socket:", socketId);
  if (document.getElementById(socketId)) return;

  const videoContainer = document.createElement('div');
  videoContainer.className = 'video-container';
  videoContainer.id = socketId;

  const video = document.createElement('video');
  video.id = `video-${socketId}`;
  const canvas = document.createElement('canvas');

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = false;

  videoContainer.appendChild(video);
  videoContainer.appendChild(canvas);
  videoGrid.appendChild(videoContainer);

  video.addEventListener('loadedmetadata', () => {
    video.play(); // <-- EXPLICITLY PLAY THE VIDEO
    console.log("Remote video metadata loaded, setting up face detection.");
    setupFaceDetection(video, canvas);
  });
}

async function initialize() {
  console.log("Loading face-api models...");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models')
  ]);
  console.log("Models loaded.");

  localStream = await startLocalVideo();

  muteButton.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack.enabled) {
      audioTrack.enabled = false;
      muteButton.textContent = 'Unmute Audio 🔇';
    } else {
      audioTrack.enabled = true;
      muteButton.textContent = 'Mute Audio 🎤';
    }
  });

  endCallButton.addEventListener('click', () => {
    localStream.getTracks().forEach(track => track.stop());
    socket.disconnect();

    document.getElementById('video-grid').style.display = 'none';
    document.getElementById('controls').style.display = 'none';
    document.getElementById('callEnded').style.display = 'block';

    document.getElementById('rejoinButton').addEventListener('click', () => {
      window.location.reload();
    });
  });
  
  console.log("Joining room...");
  socket.emit('join-room');

  socket.on('user-connected', async (newSocketId) => {
    console.log("New user connected:", newSocketId);
    const peer = createPeerConnection(newSocketId);
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('offer', { target: newSocketId, sdp: peer.localDescription });
  });

  socket.on('offer', async (payload) => {
    console.log("Received offer from:", payload.from);
    const peer = createPeerConnection(payload.from);
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit('answer', { target: payload.from, sdp: peer.localDescription });
  });

  socket.on('answer', async (payload) => {
    console.log("Received answer from:", payload.from);
    const peer = peers[payload.from];
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  });

  socket.on('ice-candidate', (payload) => {
    const peer = peers[payload.from];
    if (peer) {
      peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  });

  socket.on('user-disconnected', (socketId) => {
    console.log("User disconnected:", socketId);
    if (peers[socketId]) {
      peers[socketId].close();
      delete peers[socketId];
    }
    const videoContainer = document.getElementById(socketId);
    if (videoContainer) videoContainer.remove();
  });
}

initialize();
// const socket = io('/');
// const videoGrid = document.getElementById('video-grid');
// const localVideo = document.getElementById('localVideo');
// const localCanvas = document.getElementById('localCanvas');
// const muteButton = document.getElementById('muteButton');
// const endCallButton = document.getElementById('endCallButton');
// const peers = {};

// let localStream;

// const rtcConfig = {
//   iceServers: [
//     { urls: 'stun:stun.l.google.com:19302' },
//     { urls: 'stun:stun1.l.google.com:19302' }
//   ]
// };

// async function setupFaceDetection(videoEl, canvasEl) {
//   const context = canvasEl.getContext('2d');
//   const displaySize = { width: videoEl.clientWidth, height: videoEl.clientHeight };
//   faceapi.matchDimensions(canvasEl, displaySize);

//   setInterval(async () => {
//     if (videoEl.paused || videoEl.ended) return;
//     const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
//     const detections = await faceapi.detectAllFaces(videoEl, options).withFaceLandmarks();
//     const resizedDetections = faceapi.resizeResults(detections, displaySize);
    
//     context.clearRect(0, 0, canvasEl.width, canvasEl.height);
//     faceapi.draw.drawDetections(canvasEl, resizedDetections);
//     faceapi.draw.drawFaceLandmarks(canvasEl, resizedDetections);
//   }, 150);
// }

// async function startLocalVideo() {
//   try {
//     const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//     localVideo.srcObject = stream;
//     localVideo.onloadedmetadata = () => {
//       localVideo.play();
//       setupFaceDetection(localVideo, localCanvas);
//     };
//     return stream;
//   } catch (err) {
//     console.error("Failed to get local stream", err);
//   }
// }

// function createPeerConnection(targetSocketId) {
//   const peer = new RTCPeerConnection(rtcConfig);
//   peers[targetSocketId] = peer;

//   peer.onicecandidate = event => {
//     if (event.candidate) {
//       socket.emit('ice-candidate', { target: targetSocketId, candidate: event.candidate });
//     }
//   };

//   peer.ontrack = event => {
//     addRemoteStream(event.streams[0], targetSocketId);
//   };
  
//   return peer;
// }

// function addRemoteStream(stream, socketId) {
//   if (document.getElementById(socketId)) return;

//   const videoContainer = document.createElement('div');
//   videoContainer.className = 'video-container';
//   videoContainer.id = socketId;

//   const video = document.createElement('video');
//   const canvas = document.createElement('canvas');

//   video.srcObject = stream;
//   video.autoplay = true;
//   video.playsInline = true;
//   video.muted = false;

//   videoContainer.appendChild(video);
//   videoContainer.appendChild(canvas);
//   videoGrid.appendChild(videoContainer);

//   video.onloadedmetadata = () => {
//     setupFaceDetection(video, canvas);
//   };
// }

// async function initialize() {
//   await Promise.all([
//     faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
//     faceapi.nets.faceLandmark68Net.loadFromUri('/models')
//   ]);

//   localStream = await startLocalVideo();

//   muteButton.addEventListener('click', () => {
//     const audioTrack = localStream.getAudioTracks()[0];
//     if (audioTrack.enabled) {
//       audioTrack.enabled = false;
//       muteButton.textContent = 'Unmute Audio  unmute';
//     } else {
//       audioTrack.enabled = true;
//       muteButton.textContent = 'Mute Audio 🎤';
//     }
//   });

//   endCallButton.addEventListener('click', () => {
//     // 1. Apne camera aur mic ko band karein
//     localStream.getTracks().forEach(track => track.stop());

//     // 2. Server se disconnect karein
//     socket.disconnect();

//     // 3. UI ko saaf karein
//     document.getElementById('video-grid').innerHTML = ''; // Saare videos hata dein
//     document.getElementById('controls').style.display = 'none';
//     document.getElementById('callEnded').style.display = 'block';

//     // 4. 'Join Again' button ko kaam pe lagayein
//     document.getElementById('rejoinButton').addEventListener('click', () => {
//       window.location.reload();
//     });
//   });

//   socket.emit('join-room');

//   socket.on('user-connected', async (newSocketId) => {
//     const peer = createPeerConnection(newSocketId);
//     localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
//     const offer = await peer.createOffer();
//     await peer.setLocalDescription(offer);
//     socket.emit('offer', { target: newSocketId, sdp: peer.localDescription });
//   });

//   socket.on('offer', async (payload) => {
//     const peer = createPeerConnection(payload.from);
//     localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
//     await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
//     const answer = await peer.createAnswer();
//     await peer.setLocalDescription(answer);
//     socket.emit('answer', { target: payload.from, sdp: peer.localDescription });
//   });

//   socket.on('answer', async (payload) => {
//     const peer = peers[payload.from];
//     await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
//   });

//   socket.on('ice-candidate', (payload) => {
//     const peer = peers[payload.from];
//     if (peer) {
//       peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
//     }
//   });

//   socket.on('user-disconnected', (socketId) => {
//     if (peers[socketId]) peers[socketId].close();
//     delete peers[socketId];
//     const videoContainer = document.getElementById(socketId);
//     if (videoContainer) videoContainer.remove();
//   });
// }

// initialize();
// frontend.js (UI Flow, WebRTC, Recording, Calculator, PWA Registration)

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Global State Variables ---
    let ws; // WebSocket connection
    let localStream;
    let peerConnections = {}; // Store RTCPeerConnections: { userID: RTCPeerConnection }
    let mediaRecorder;
    let recordedChunks = [];
    let isHost = false;
    let currentRoomID = null;
    let userName = 'Guest';
    let timerInterval;

    // --- UI Element Selectors ---
    const $ = (selector) => document.querySelector(selector);
    const landingPage = $('#landing-page');
    const hostClassroom = $('#host-classroom');
    const joinerClassroom = $('#joiner-classroom');
    const joinerQuestionBtn = $('#joiner-question-btn');


    // --- 9. PWA App Mode Registration ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered:', reg))
            .catch(err => console.error('SW Registration Error:', err));
    }

    // --- 11. Server Connection Logic ---
    function connectWebSocket() {
        // *******************************************************************
        // *** 🛑 FINAL STEP: REPLACE THIS WITH YOUR LIVE RENDER URL (wss://...) ***
        const RENDER_URL = 'wss://YOUR-RENDER-SERVER-NAME.onrender.com'; 
        // *******************************************************************
        
        ws = new WebSocket(RENDER_URL); 
        
        ws.onopen = () => console.log('WebSocket connected.');
        ws.onclose = () => console.log('WebSocket disconnected.');
        ws.onerror = (error) => console.error('WebSocket error:', error);
        
        ws.onmessage = handleWebSocketMessage;
    }
    connectWebSocket();
    
    // --- Web Socket Message Handler ---
    function handleWebSocketMessage(event) {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'room_created':
                currentRoomID = data.roomID;
                $('#display-room-id').textContent = data.roomID;
                $('#new-room-id').classList.remove('hidden');
                $('#copy-id-btn').classList.remove('hidden');
                $('#enter-host-class-btn').classList.remove('hidden');
                break;
            
            case 'webrtc_signal':
                // handleSignalingMessage(data); 
                break;
                
            case 'user_joined':
                if (isHost) {
                    console.log('New user joined:', data.userID, data.userName);
                }
                break;

            case 'question_request': // 4. Question System
                if (isHost) {
                    displayQuestionRequest(data.userID, data.userName);
                }
                break;

            case 'unmute_allowed':
                // Joiner received permission: enable local audio track
                localStream.getAudioTracks().forEach(track => track.enabled = true);
                joinerQuestionBtn.textContent = '🔊 Speaking... (Click to mute yourself)';
                joinerQuestionBtn.dataset.state = 'speaking';
                joinerQuestionBtn.disabled = false;
                break;
                
            case 'mute_enforced':
                // Joiner received mute command: disable local audio track
                localStream.getAudioTracks().forEach(track => track.enabled = false);
                joinerQuestionBtn.textContent = '❓ Raise Hand';
                joinerQuestionBtn.dataset.state = 'ready';
                joinerQuestionBtn.disabled = false;
                break;

            case 'new_chat_message': // 12. Real-Time Chat
                displayChatMessage(data.message);
                break;
                
            case 'class_ended':
                alert('The host has ended the class.');
                window.location.reload();
                break;
        }
    }

    // --- 1. FIRST PAGE — UI Flow Logic ---
    
    // Toggle Join/Invite sections
    $('#show-join-btn').addEventListener('click', () => {
        $('#join-section').classList.toggle('hidden');
        $('#invite-section').classList.add('hidden');
    });
    $('#show-invite-btn').addEventListener('click', () => {
        $('#invite-section').classList.toggle('hidden');
        $('#join-section').classList.add('hidden');
    });

    // B) Invite / Create a class
    $('#create-room-btn').addEventListener('click', () => {
        isHost = true;
        userName = 'Host'; 
        ws.send(JSON.stringify({ type: 'create_room' }));
    });

    $('#copy-id-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(currentRoomID).then(() => {
            alert('Room ID copied!');
        });
    });

    $('#enter-host-class-btn').addEventListener('click', () => {
        showView(hostClassroom);
        $('#host-class-id').textContent = `ID: ${currentRoomID}`;
        startClassTimer(true);
        startMediaStream(true);
    });

    // A) Join a Class
    $('#join-room-btn').addEventListener('click', () => {
        const roomID = $('#room-id-input').value.trim();
        const inputName = $('#user-name-input').value.trim();
        if (!roomID || !inputName) {
            alert('Please enter a Room ID and Your Name.');
            return;
        }
        isHost = false;
        currentRoomID = roomID;
        userName = inputName;
        
        ws.send(JSON.stringify({ type: 'join_room', roomID: roomID, userName: userName }));
        
        showView(joinerClassroom);
        $('#joiner-class-id').textContent = `ID: ${currentRoomID}`;
        startClassTimer(false);
        startMediaStream(false);
    });
    
    // --- Media and WebRTC Setup ---
    async function startMediaStream(isHostView) {
        const constraints = {
            video: {
                width: { ideal: 320 }, 
                height: { ideal: 240 },
                frameRate: { ideal: 10 }
            },
            audio: true
        };
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (isHostView) {
                $('#host-local-video').srcObject = localStream;
            } else {
                $('#joiner-local-video').srcObject = localStream;
            }
            
            if (!isHostView) {
                localStream.getAudioTracks().forEach(track => track.enabled = false);
            }
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            alert('Could not start camera/mic. Please check permissions.');
        }
    }
    
    // --- 3. Host Control Features ---
    $('#start-stream-btn').addEventListener('click', () => {
        $('#start-stream-btn').textContent = '✔ Streaming Active';
        $('#start-stream-btn').disabled = true;
        console.log('Start Streaming initiated.');
    });
    
    $('#mute-self-btn').addEventListener('click', (e) => {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            e.target.textContent = audioTrack.enabled ? '🎤 Mute Self' : '🔇 Unmute Self';
        }
    });

    $('#done-class-btn').addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        ws.send(JSON.stringify({ type: 'end_class', roomID: currentRoomID }));
        
        localStream.getTracks().forEach(track => track.stop());
        clearInterval(timerInterval);
        
        if ($('#download-lecture-link').href) {
            $('#download-lecture-link').classList.remove('hidden');
        }
        $('#done-class-btn').classList.add('hidden');
        alert('Class ended. You can now download the lecture.');
    });
    
    $('#joiner-exit-class-btn').addEventListener('click', () => {
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        clearInterval(timerInterval);
        ws.close();
        window.location.reload();
    });

    // --- 5. LIVE RECORDING SYSTEM ---
    $('#record-btn').addEventListener('click', async (e) => {
        if (!localStream) return alert('Start stream first.');

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            recordedChunks = [];
            
            const recordingStream = localStream.clone(); 
            
            mediaRecorder = new MediaRecorder(recordingStream, { 
                mimeType: 'video/webm; codecs=vp8',
                videoBitsPerSecond: 500000 
            }); 
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                $('#download-lecture-link').href = url;
                $('#download-lecture-link').textContent = '⬇ Download Lecture';
                e.target.textContent = '📼 Start Recording';
                e.target.classList.remove('recording-active');
            };
            
            mediaRecorder.start(1000); 
            e.target.textContent = '■ Stop Recording';
            e.target.classList.add('recording-active');

        } else if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    });

    // --- 10. SCREEN SHARING ---
    $('#screen-share-btn').addEventListener('click', async () => {
        if (!isHost || !localStream) return;
        
        try {
            const currentVideoTrack = localStream.getVideoTracks()[0];
            const isSharing = currentVideoTrack && currentVideoTrack.label.includes('screen');
            
            if (!isSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                
                localStream.removeTrack(currentVideoTrack);
                localStream.addTrack(screenTrack);
                $('#host-local-video').srcObject = localStream;

                screenTrack.onended = () => {
                    startMediaStream(true);
                    $('#screen-share-btn').textContent = '💻 Share Screen';
                };
                $('#screen-share-btn').textContent = 'Stop Sharing (Active)';
            } else {
                currentVideoTrack.stop();
                startMediaStream(true);
                $('#screen-share-btn').textContent = '💻 Share Screen';
            }
        } catch (err) {
            console.error("Error sharing screen:", err);
        }
    });

    // --- 6. CALCULATOR FEATURE ---
    function setupCalculator(toggleBtnId) {
        const calcWindow = $('#calculator-window');
        const calcDisplay = $('#calc-display');
        let currentInput = '0';
        let operator = null;
        let firstOperand = null;
        let waitingForSecond = false;

        $(toggleBtnId).addEventListener('click', () => {
            calcWindow.classList.toggle('active');
            calcWindow.classList.toggle('hidden');
        });

        // Simple calculation logic
        calcWindow.addEventListener('click', (e) => {
            if (!e.target.classList.contains('calc-btn')) return;
            const value = e.target.getAttribute('data-value');

            if (value === 'C') {
                currentInput = '0';
                operator = null;
                firstOperand = null;
                waitingForSecond = false;
            } else if (value === '=') {
                if (operator && firstOperand !== null) {
                    const secondOperand = parseFloat(waitingForSecond ? currentInput : firstOperand);
                    try {
                        let result = eval(`${firstOperand} ${operator} ${secondOperand}`);
                        currentInput = result.toString();
                        firstOperand = null;
                        operator = null;
                        waitingForSecond = false;
                    } catch {
                        currentInput = 'Error';
                    }
                }
            } else if (['+', '-', '*', '/'].includes(value)) {
                if (firstOperand === null) {
                    firstOperand = parseFloat(currentInput);
                }
                operator = value;
                waitingForSecond = true;
            } else if (value === '.') {
                if (waitingForSecond) {
                    currentInput = '0.';
                    waitingForSecond = false;
                } else if (!currentInput.includes('.')) {
                    currentInput += '.';
                }
            } else { // Numbers
                if (currentInput === '0' || waitingForSecond) {
                    currentInput = value;
                    waitingForSecond = false;
                } else {
                    currentInput += value;
                }
            }
            calcDisplay.value = currentInput;
        });
    }
    setupCalculator('#calculator-toggle-btn'); // Host
    setupCalculator('#joiner-calculator-toggle-btn'); // Joiner
    
    // --- 4. QUESTION SYSTEM Logic (Host Side) ---
    function displayQuestionRequest(userID, userName) {
        const list = $('#active-questions-list');
        const noRequests = $('.no-requests');
        if (noRequests) noRequests.style.display = 'none';

        const entry = document.createElement('div');
        entry.className = 'question-entry';
        entry.dataset.userId = userID;
        entry.innerHTML = `
            <span>${userName} wants to ask a question.</span>
            <button class="unmute-user-btn" data-action="unmute">Unmute</button>
        `;
        list.appendChild(entry);
    }
    
    $('#questions-bar').addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('unmute-user-btn')) {
            const entry = target.closest('.question-entry');
            const targetUserID = entry.dataset.userId;

            if (target.dataset.action === 'unmute') {
                ws.send(JSON.stringify({ type: 'unmute_command', roomID: currentRoomID, targetUserID: targetUserID }));
                target.textContent = 'Mute & Done';
                target.dataset.action = 'mute';
            } else {
                ws.send(JSON.stringify({ type: 'mute_command', roomID: currentRoomID, targetUserID: targetUserID }));
                entry.remove();
                if ($('#active-questions-list').children.length === 0) {
                    const noRequests = document.createElement('p');
                    noRequests.className = 'no-requests';
                    noRequests.textContent = 'No current question requests.';
                    $('#active-questions-list').appendChild(noRequests);
                }
            }
        }
    });

    // --- 4. QUESTION SYSTEM Logic (Joiner Side) ---
    joinerQuestionBtn.addEventListener('click', (e) => {
        const state = e.target.dataset.state;
        
        if (state === 'ready' || !state) {
            ws.send(JSON.stringify({ type: 'raise_hand', roomID: currentRoomID, userName: userName }));
            e.target.textContent = '✋ Question Sent (Waiting...)';
            e.target.dataset.state = 'waiting';
            e.target.disabled = true;
        } else if (state === 'speaking') {
            localStream.getAudioTracks().forEach(track => track.enabled = false);
            ws.send(JSON.stringify({ type: 'done_speaking', roomID: currentRoomID, userName: userName })); 
            
            e.target.textContent = '❓ Raise Hand';
            e.target.dataset.state = 'ready';
        }
    });

    // --- 12. Real-Time Chat ---
    function sendChat(inputElement) {
        const text = inputElement.value.trim();
        if (text) {
            ws.send(JSON.stringify({ type: 'chat_message', roomID: currentRoomID, userName: userName, text: text }));
            inputElement.value = '';
        }
    }
    
    $('#send-chat-btn').addEventListener('click', () => sendChat($('#chat-input'))); 
    $('#chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat($('#chat-input')); });
    
    $('#joiner-send-chat-btn').addEventListener('click', () => sendChat($('#joiner-chat-input'))); 
    $('#joiner-chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat($('#joiner-chat-input')); });

    function displayChatMessage(message) {
        const chatBox = isHost ? $('#chat-messages') : null;
        if (!chatBox && isHost) return; 
        
        const msgEl = document.createElement('p');
        const isSelf = message.senderID === ws.id;
        msgEl.innerHTML = `<strong>${isSelf ? 'You' : message.senderName}:</strong> ${message.text}`;
        msgEl.className = isSelf ? 'chat-self' : 'chat-other';
        
        if (isHost) {
            chatBox.appendChild(msgEl);
            chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            console.log(`[Chat] ${message.senderName}: ${message.text}`);
        }
    }
    
    // --- Helper Functions ---
    function showView(viewElement) {
        [landingPage, hostClassroom, joinerClassroom].forEach(v => v.classList.add('hidden'));
        viewElement.classList.remove('hidden');
    }
    
    function startClassTimer(isHostView) {
        let seconds = 0;
        const timeDisplay = isHostView ? $('#host-time-spent') : $('#joiner-time-spent');
        
        timerInterval = setInterval(() => {
            seconds++;
            const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            timeDisplay.textContent = `Time: ${h}:${m}:${s}`;
        }, 1000);
    }
});
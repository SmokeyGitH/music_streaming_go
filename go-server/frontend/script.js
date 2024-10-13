document.addEventListener('DOMContentLoaded', function () {
    const musicListElement = document.getElementById('music-list');
    const audioPlayer = document.getElementById('audio-player');
    const nowPlayingElement = document.getElementById('now-playing');
    const currentSongElement = document.getElementById('current-song');

    let ws; // WebSocket connection
    let isPlaying = false; // To track if audio is playing
    let currentFile = ''; // To track the currently playing file

    // Initialize WebSocket connection
    function initWebSocket() {
        try {
            ws = new WebSocket('ws://localhost:5000/ws');

            ws.onmessage = function (event) {
                const data = JSON.parse(event.data);
                console.log("Received sync message:", data);
                handleSyncMessage(data);
            };

            ws.onopen = function () {
                console.log("Connected to WebSocket server");
            };

            ws.onerror = function (error) {
                console.error("WebSocket error:", error);
            };

            ws.onclose = function () {
                console.log("WebSocket connection closed");
            };
        } catch (error) {
            console.error("Error initializing WebSocket:", error);
        }
    }

    // Function to fetch the list of available music from the backend
    function fetchMusicList() {
        fetch('http://localhost:5000/music-list')
            .then(response => response.json())
            .then(musicList => {
                musicListElement.innerHTML = ''; // Clear the loading message

                if (musicList.length === 0) {
                    musicListElement.innerHTML = '<li>No music available</li>';
                    return;
                }

                // Populate the list with the music files
                musicList.forEach(music => {
                    const li = document.createElement('li');
                    li.textContent = music;
                    li.addEventListener('click', () => playMusic(music));
                    musicListElement.appendChild(li);
                });
            })
            .catch(error => {
                musicListElement.innerHTML = '<li>Error fetching music list</li>';
                console.error('Error fetching music list:', error);
            });
    }

    // Function to play selected music and send sync message
    function playMusic(fileName) {
        const musicUrl = `http://localhost:5000/music?file=${encodeURIComponent(fileName)}`;
        
        currentFile = fileName;
        audioPlayer.src = musicUrl;
        audioPlayer.play();

        // Display the now playing section
        nowPlayingElement.classList.remove('hidden');
        currentSongElement.textContent = fileName;

        // Send play sync message to the server
        sendSyncMessage('play', 0, fileName);
    }

    // Function to handle sync message from the WebSocket server
    function handleSyncMessage(data) {
        if (data.file !== currentFile) {
            const musicUrl = `http://localhost:5000/music?file=${encodeURIComponent(data.file)}`;
            currentFile = data.file;
            audioPlayer.src = musicUrl;
        }

        // Synchronize playback according to the event type
        if (data.type === 'play') {
            audioPlayer.currentTime = data.time;
            audioPlayer.play();
        } else if (data.type === 'pause') {
            audioPlayer.pause();
        } else if (data.type === 'seek') {
            audioPlayer.currentTime = data.time;
        }
    }

    // Send sync message to the WebSocket server
    function sendSyncMessage(type, time, file) {
        const message = {
            type: type,
            time: time,
            file: file
        };
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    // Event listeners for audio player (play, pause, seek)
    audioPlayer.addEventListener('play', function () {
        if (!isPlaying) {
            sendSyncMessage('play', audioPlayer.currentTime, currentFile);
            isPlaying = true;
        }
    });

    audioPlayer.addEventListener('pause', function () {
        if (isPlaying) {
            sendSyncMessage('pause', audioPlayer.currentTime, currentFile);
            isPlaying = false;
        }
    });

    audioPlayer.addEventListener('seeked', function () {
        sendSyncMessage('seek', audioPlayer.currentTime, currentFile);
    });

    // Fetch the music list on page load
    fetchMusicList();

    // Initialize the WebSocket connection
    initWebSocket();
});

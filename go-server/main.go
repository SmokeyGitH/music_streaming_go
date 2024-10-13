package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/websocket"
)

const musicDir = "./music/"

var clients = make(map[*websocket.Conn]bool) // Connected clients
var broadcast = make(chan SyncMessage)       // Broadcast channel

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// SyncMessage struct to handle playback synchronization
type SyncMessage struct {
	Type string  `json:"type"` // play, pause, seek, etc.
	Time float64 `json:"time"` // Current playback time
	File string  `json:"file"` // Currently playing file
}

func main() {
	// Serve the music files
	http.HandleFunc("/music", serveMusic)

	// List all available music files
	http.HandleFunc("/music-list", listMusic)

	// WebSocket for real-time synchronization
	http.HandleFunc("/ws", handleConnections)

	// Start a goroutine to handle incoming sync messages
	go handleMessages()

	// Start the server
	fmt.Println("Server is running on port 5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}

func serveMusic(w http.ResponseWriter, r *http.Request) {
	fileName := r.URL.Query().Get("file")
	if fileName == "" {
		http.Error(w, "File not specified", http.StatusBadRequest)
		return
	}
	filePath := filepath.Join(musicDir, fileName)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, filePath)
}

func listMusic(w http.ResponseWriter, r *http.Request) {
	var files []string
	err := filepath.Walk(musicDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			files = append(files, info.Name())
		}
		return nil
	})
	w.Header().Add("Access-Control-Allow-Origin","*");
	w.Header().Add("Access-Control-Allow-Methods","*");
	if err != nil {
		http.Error(w, "Unable to list files", http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(files)

}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	// Upgrade initial GET request to a WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal(err)
	}
	// Close the connection when the function returns
	defer ws.Close()

	// Register the new client
	clients[ws] = true

	// Listen for messages from the client
	for {
		var msg SyncMessage
		// Read new message as JSON and map to SyncMessage struct
		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Printf("Error: %v", err)
			delete(clients, ws)
			break
		}
		// Send the message to the broadcast channel
		broadcast <- msg
	}
}

func handleMessages() {
	for {
		// Grab the next message from the broadcast channel
		msg := <-broadcast
		// Send the message to all connected clients
		for client := range clients {
			err := client.WriteJSON(msg)
			if err != nil {
				log.Printf("Error: %v", err)
				client.Close()
				delete(clients, client)
			}
		}
	}
}

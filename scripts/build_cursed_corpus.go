package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
)

func main() {
	dir := filepath.Join("test_dataset", "cursed")
	os.MkdirAll(dir, 0755)

	// 1. invalid_no_moov.mp4 (only ftyp and mdat)
	func() {
		f, _ := os.Create(filepath.Join(dir, "invalid_no_moov.mp4"))
		defer f.Close()
		writeBox(f, "ftyp", []byte("isom"))
		writeBox(f, "mdat", []byte{0, 0, 0, 0})
	}()

	// 2. streaming_disabled.mp4 (mdat before moov)
	func() {
		f, _ := os.Create(filepath.Join(dir, "streaming_disabled.mp4"))
		defer f.Close()
		writeBox(f, "ftyp", []byte("isom"))
		writeBox(f, "mdat", []byte{0, 0, 0, 0})
		writeBox(f, "moov", []byte{0, 0, 0, 0}) // fake moov
	}()

	// 3. fake_extension.mp3 (just some text)
	ioutil.WriteFile(filepath.Join(dir, "fake_extension.mp3"), []byte("This is actually a text file, not an MP3"), 0644)

	// 4. broken_ebml.mkv (valid EBML ID, but completely garbage size/data)
	func() {
		f, _ := os.Create(filepath.Join(dir, "broken_ebml.mkv"))
		defer f.Close()
		// EBML ID: 0x1A45DFA3, Size: unknown (0xFF), followed by garbage
		f.Write([]byte{0x1A, 0x45, 0xDF, 0xA3, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44})
	}()

	// 5. huge_id3.mp3 (exceeds 5MB limit to test circuit breaker)
	func() {
		f, _ := os.Create(filepath.Join(dir, "huge_id3.mp3"))
		defer f.Close()
		// Write ID3v2 header: "ID3" + version(2 bytes) + flags(1 byte) + size(4 bytes syncsafe)
		// We will specify a size of 6MB. 6MB = 6 * 1024 * 1024 = 6291456 bytes.
		// Syncsafe integer for 6291456:
		b1 := byte((6291456 >> 21) & 0x7F)
		b2 := byte((6291456 >> 14) & 0x7F)
		b3 := byte((6291456 >> 7) & 0x7F)
		b4 := byte(6291456 & 0x7F)

		f.Write([]byte{'I', 'D', '3', 0x04, 0x00, 0x00, b1, b2, b3, b4})

		// Fill 6MB with zeroes
		chunk := make([]byte, 1024*1024)
		for i := 0; i < 6; i++ {
			f.Write(chunk)
		}

		// Write a fake Xing header to prove it doesn't crash
		f.Write([]byte{0xFF, 0xFB, 0x90, 0x64}) // Frame sync
		f.Write(make([]byte, 32))
		f.Write([]byte("Xing"))
		f.Write([]byte{0x00, 0x00, 0x00, 0x01}) // Frames flag
		f.Write([]byte{0x00, 0x00, 0x10, 0x00}) // 4096 frames
	}()

	// 6. zero_byte.mkv
	ioutil.WriteFile(filepath.Join(dir, "zero_byte.mkv"), []byte{}, 0644)

	fmt.Println("Cursed media corpus generated successfully.")
}

func writeBox(w io.Writer, typ string, data []byte) {
	size := uint32(len(data) + 8)
	binary.Write(w, binary.BigEndian, size)
	w.Write([]byte(typ))
	w.Write(data)
}

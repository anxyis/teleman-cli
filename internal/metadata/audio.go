package metadata

import (
	"bytes"
	"encoding/binary"
	"io"

	"github.com/dhowden/tag"
)

// cappedReadSeeker acts as a circuit breaker to prevent massive memory allocations
// when parsing maliciously large ID3v2 tags (e.g. 100MB embedded artwork).
type cappedReadSeeker struct {
	rs        io.ReadSeeker
	bytesRead int64
	limit     int64
}

func (c *cappedReadSeeker) Read(p []byte) (int, error) {
	if c.bytesRead >= c.limit {
		return 0, io.EOF
	}
	n, err := c.rs.Read(p)
	c.bytesRead += int64(n)
	return n, err
}

func (c *cappedReadSeeker) Seek(offset int64, whence int) (int64, error) {
	return c.rs.Seek(offset, whence)
}

// parseAudio extracts tags and duration for audio files safely.
func parseAudio(r io.ReadSeeker, filename, ext string, info *MediaInfo) {
	r.Seek(0, io.SeekStart)

	// Wrap in a circuit breaker. 5MB should be plenty for normal artwork and tags.
	cappedRS := &cappedReadSeeker{rs: r, limit: 5 * 1024 * 1024}

	m, err := tag.ReadFrom(cappedRS)
	if err == nil && m != nil {
		info.Title = m.Title()
		info.Performer = m.Artist()
		if info.Performer == "" {
			info.Performer = m.AlbumArtist()
		}
		info.Album = m.Album()
		info.Year = m.Year()

		if pic := m.Picture(); pic != nil {
			info.ThumbData = pic.Data
		}
	}

	if ext == ".mp3" {
		info.Duration = extractMP3DurationFast(r)
	}
}

// extractMP3DurationFast scans the first 128KB of the file for Xing, Info, or VBRI headers
// to determine VBR duration in O(1) time without scanning the payload.
// If headers are missing or malformed, it gracefully returns 0.
func extractMP3DurationFast(r io.ReadSeeker) int {
	r.Seek(0, io.SeekStart)
	
	// Read first 128KB (plenty to get past ID3v2 and find the first frame)
	buf := make([]byte, 128*1024)
	n, _ := io.ReadFull(r, buf)
	if n < 128 {
		return 0
	}
	buf = buf[:n]

	// Search for Xing or Info headers
	idx := bytes.Index(buf, []byte("Xing"))
	if idx == -1 {
		idx = bytes.Index(buf, []byte("Info"))
	}

	if idx != -1 && idx+12 <= len(buf) {
		flags := binary.BigEndian.Uint32(buf[idx+4 : idx+8])
		// Flag 0x01 indicates Frames field is present
		if flags&0x01 == 0x01 {
			frames := binary.BigEndian.Uint32(buf[idx+8 : idx+12])
			// Typical MP3 frame is 1152 samples. Assume 44.1kHz if we don't deeply parse the header.
			// duration = frames * 1152 / 44100
			durationSecs := (float64(frames) * 1152.0) / 44100.0
			return int(durationSecs)
		}
	}

	// Search for VBRI header (Fraunhofer VBR)
	idxVBRI := bytes.Index(buf, []byte("VBRI"))
	if idxVBRI != -1 && idxVBRI+18 <= len(buf) {
		// VBRI Frames field is at offset 14 (uint32)
		frames := binary.BigEndian.Uint32(buf[idxVBRI+14 : idxVBRI+18])
		durationSecs := (float64(frames) * 1152.0) / 44100.0
		return int(durationSecs)
	}

	return 0 // Fallback gracefully to 0 (no frame scanning)
}

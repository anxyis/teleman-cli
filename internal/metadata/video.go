package metadata

import (
	"errors"
	"io"
	"time"

	"github.com/abema/go-mp4"
	"github.com/remko/go-mkvparse"
)

// parseVideo extracts duration and dimensions for video files.
func parseVideo(r io.ReadSeeker, filename, ext string, info *MediaInfo) {
	if ext == ".mp4" || ext == ".mov" {
		parseMP4(r, info)
	} else if ext == ".mkv" || ext == ".webm" {
		parseMKV(r, info)
	}
}

func parseMP4(r io.ReadSeeker, info *MediaInfo) {
	r.Seek(0, io.SeekStart)

	// We do a fast scan over the top-level boxes to determine streaming support and extract metadata.
	// This does not read the payload, so it's extremely fast.
	var moovOffset, mdatOffset int64 = -1, -1

	_, _ = mp4.ReadBoxStructure(r, func(h *mp4.ReadHandle) (interface{}, error) {
		boxType := h.BoxInfo.Type.String()
		if boxType == "moov" {
			moovOffset = int64(h.BoxInfo.Offset)
			// Expand moov to find mvhd and tkhd
			return h.Expand()
		} else if boxType == "mdat" {
			mdatOffset = int64(h.BoxInfo.Offset)
			// Don't expand mdat (media payload)
			return nil, nil
		} else if boxType == "trak" {
			return h.Expand()
		}

		if h.BoxInfo.Type == mp4.BoxTypeMvhd() {
			box, _, err := h.ReadPayload()
			if err == nil {
				mvhd := box.(*mp4.Mvhd)
				if mvhd.Timescale > 0 {
					info.Duration = int(mvhd.DurationV0 / mvhd.Timescale)
					if mvhd.Version == 1 {
						info.Duration = int(mvhd.DurationV1 / uint64(mvhd.Timescale))
					}
				}
			}
		}

		if h.BoxInfo.Type == mp4.BoxTypeTkhd() {
			box, _, err := h.ReadPayload()
			if err == nil {
				tkhd := box.(*mp4.Tkhd)
				if info.Width == 0 && info.Height == 0 {
					// Dimensions are fixed-point 16.16 format in mp4
					info.Width = int(tkhd.Width >> 16)
					info.Height = int(tkhd.Height >> 16)
				}
			}
		}

		return nil, nil
	})

	// Safely determine streaming capability based on atom placement
	if moovOffset >= 0 && mdatOffset >= 0 && moovOffset < mdatOffset {
		info.SupportsStreaming = true
	} else {
		info.SupportsStreaming = false
	}
}

// mkvHandler implements mkvparse.Handler
type mkvHandler struct {
	info        *MediaInfo
	timecodeSc  float64
	duration    float64
	stopParsing bool
	byteLimit   int64
	bytesRead   int64
}

func (h *mkvHandler) HandleMasterBegin(id mkvparse.ElementID, info mkvparse.ElementInfo) (bool, error) {
	if h.stopParsing {
		return false, errors.New("stop")
	}
	
	h.bytesRead = info.Offset
	if h.byteLimit > 0 && h.bytesRead > h.byteLimit {
		h.stopParsing = true
		return false, errors.New("byte limit exceeded")
	}

	// Stop parsing immediately if we hit a Cluster (media payload)
	if id == mkvparse.ClusterElement {
		h.stopParsing = true
		return false, nil
	}
	return true, nil
}

func (h *mkvHandler) HandleMasterEnd(id mkvparse.ElementID, info mkvparse.ElementInfo) error {
	return nil
}

func (h *mkvHandler) HandleString(id mkvparse.ElementID, value string, info mkvparse.ElementInfo) error {
	return nil
}

func (h *mkvHandler) HandleInteger(id mkvparse.ElementID, value int64, info mkvparse.ElementInfo) error {
	if id == mkvparse.TimecodeScaleElement {
		h.timecodeSc = float64(value)
	} else if id == mkvparse.PixelWidthElement {
		if h.info.Width == 0 {
			h.info.Width = int(value)
		}
	} else if id == mkvparse.PixelHeightElement {
		if h.info.Height == 0 {
			h.info.Height = int(value)
		}
	}
	return nil
}

func (h *mkvHandler) HandleFloat(id mkvparse.ElementID, value float64, info mkvparse.ElementInfo) error {
	if id == mkvparse.DurationElement {
		h.duration = value
	}
	return nil
}

func (h *mkvHandler) HandleDate(id mkvparse.ElementID, value time.Time, info mkvparse.ElementInfo) error {
	return nil
}

func (h *mkvHandler) HandleBinary(id mkvparse.ElementID, value []byte, info mkvparse.ElementInfo) error {
	return nil
}

func parseMKV(r io.ReadSeeker, info *MediaInfo) {
	r.Seek(0, io.SeekStart)

	handler := &mkvHandler{
		info:       info,
		timecodeSc: 1000000.0, // Default timecode scale (1ms)
		byteLimit:  10 * 1024 * 1024, // 10MB safety cap to prevent infinite loops
	}
	
	// Error is explicitly ignored (best-effort extraction, safe fallback)
	_ = mkvparse.ParseSections(r, handler, mkvparse.SegmentElement, mkvparse.InfoElement, mkvparse.TracksElement)
	
	if handler.duration > 0 {
		// MKV duration = Duration * TimecodeScale (in nanoseconds)
		ns := handler.duration * handler.timecodeSc
		info.Duration = int(ns / 1000000000.0)
	}
}

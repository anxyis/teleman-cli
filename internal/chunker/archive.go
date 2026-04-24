package chunker

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// StreamZip creates an io.Reader that streams a directory (or file) directly into a standard Zip archive
func StreamZip(sourcePath string) (io.Reader, error) {
	pr, pw := io.Pipe()

	go func() {
		defer pw.Close()
		zw := zip.NewWriter(pw)
		defer zw.Close()

		info, err := os.Stat(sourcePath)
		if err != nil {
			pw.CloseWithError(err)
			return
		}

		baseDir := sourcePath
		if !info.IsDir() {
			baseDir = filepath.Dir(sourcePath)
		}

		err = filepath.Walk(sourcePath, func(path string, fInfo os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if fInfo.IsDir() {
				return nil
			}

			relPath, err := filepath.Rel(baseDir, path)
			if err != nil {
				return err
			}

			f, err := os.Open(path)
			if err != nil {
				return err
			}
			defer f.Close()

			fh, err := zip.FileInfoHeader(fInfo)
			if err != nil {
				return err
			}
			fh.Name = strings.ReplaceAll(relPath, "\\", "/")
			fh.Method = zip.Deflate

			w, err := zw.CreateHeader(fh)
			if err != nil {
				return err
			}

			if _, err := io.Copy(w, f); err != nil {
				return err
			}

			return nil
		})

		if err != nil {
			pw.CloseWithError(err)
		}
	}()

	return pr, nil
}

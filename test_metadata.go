package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/teleman-cli/teleman/internal/metadata"
)

func main() {
	dir := filepath.Join("test_dataset", "cursed")
	files, err := os.ReadDir(dir)
	if err != nil {
		panic(err)
	}

	for _, file := range files {
		if file.IsDir() {
			continue
		}
		path := filepath.Join(dir, file.Name())
		f, err := os.Open(path)
		if err != nil {
			fmt.Printf("Error opening %s: %v\n", file.Name(), err)
			continue
		}
		
		info, err := f.Stat()
		size := int64(0)
		if err == nil {
			size = info.Size()
		}
		
		fmt.Printf("Testing: %s\n", file.Name())
		mediaInfo := metadata.Parse(f, path, size)
		fmt.Printf("Parsed Info: %+v\n", mediaInfo)
		fmt.Printf("Caption:\n%s\n", metadata.GenerateCaption(mediaInfo, path))
		fmt.Println("----")
		f.Close()
	}
}

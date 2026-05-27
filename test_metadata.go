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
		
		fmt.Printf("Testing: %s\n", file.Name())
		info := metadata.Parse(f, path)
		fmt.Printf("Parsed Info: %+v\n", info)
		fmt.Printf("Caption:\n%s\n", metadata.GenerateCaption(info, path))
		fmt.Println("----")
		f.Close()
	}
}

package logger

import (
	"fmt"
	"os"
)

var (
	Verbose bool
	Quiet   bool
)

// Init sets the global verbosity levels
func Init(v, q bool) {
	Verbose = v
	Quiet = q
}

// Info prints standard operational steps (Default mode)
// Examples: "[1/5] uploading file.txt" or final summaries.
// This is silenced if Quiet is true.
func Info(format string, a ...interface{}) {
	if !Quiet {
		fmt.Printf(format+"\n", a...)
	}
}

// Step prints high-level pipeline markers.
// Examples: "=> Loading Virtual Index"
// This is ONLY printed if Verbose is true.
func Step(format string, a ...interface{}) {
	if Verbose && !Quiet {
		fmt.Printf(format+"\n", a...)
	}
}

// Success prints decorated status messages.
// Silenced in Quiet mode.
func Success(format string, a ...interface{}) {
	if !Quiet {
		fmt.Printf(format+"\n", a...)
	}
}

// Warn prints warning messages.
// Silenced in Quiet mode.
func Warn(format string, a ...interface{}) {
	if !Quiet {
		fmt.Printf(format+"\n", a...)
	}
}

// Debug prints deeply internal details (like "Connected as: Teleman")
// strictly only if Verbose is true.
func Debug(format string, a ...interface{}) {
	if Verbose && !Quiet {
		fmt.Printf(format+"\n", a...)
	}
}

// Error strictly prints to os.Stderr regardless of Quiet mode.
func Error(format string, a ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", a...)
}

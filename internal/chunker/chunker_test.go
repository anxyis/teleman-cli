package chunker

import (
	"bytes"
	"encoding/hex"
	"testing"
)

func TestDeriveKey(t *testing.T) {
	tests := []struct {
		name       string
		passphrase []byte
		salt       []byte
	}{
		{
			name:       "Basic inputs",
			passphrase: []byte("mysecretpassword"),
			salt:       []byte("randomsalt123"),
		},
		{
			name:       "Empty passphrase",
			passphrase: []byte{},
			salt:       []byte("somesalt"),
		},
		{
			name:       "Empty salt",
			passphrase: []byte("password123"),
			salt:       []byte{},
		},
		{
			name:       "Empty both",
			passphrase: []byte{},
			salt:       []byte{},
		},
		{
			name:       "Very long passphrase",
			passphrase: bytes.Repeat([]byte("a"), 1000),
			salt:       []byte("salt"),
		},
		{
			name:       "Very long salt",
			passphrase: []byte("pass"),
			salt:       bytes.Repeat([]byte("b"), 1000),
		},
		{
			name:       "Very long both",
			passphrase: bytes.Repeat([]byte("a"), 1000),
			salt:       bytes.Repeat([]byte("b"), 1000),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := DeriveKey(tt.passphrase, tt.salt)
			if err != nil {
				t.Fatalf("DeriveKey failed: %v", err)
			}

			// Check key length
			if len(key) != 32 {
				t.Errorf("Expected key length 32, got %d", len(key))
			}
		})
	}
}

func TestDeriveKey_Determinism(t *testing.T) {
	passphrase := []byte("determinism_pass")
	salt := []byte("determinism_salt")

	key1, err1 := DeriveKey(passphrase, salt)
	if err1 != nil {
		t.Fatalf("First DeriveKey failed: %v", err1)
	}

	key2, err2 := DeriveKey(passphrase, salt)
	if err2 != nil {
		t.Fatalf("Second DeriveKey failed: %v", err2)
	}

	if !bytes.Equal(key1, key2) {
		t.Errorf("DeriveKey is not deterministic! key1: %x, key2: %x", key1, key2)
	}
}

func TestDeriveKey_Uniqueness(t *testing.T) {
	passphrase := []byte("unique_pass")
	salt1 := []byte("salt1")
	salt2 := []byte("salt2")

	key1, _ := DeriveKey(passphrase, salt1)
	key2, _ := DeriveKey(passphrase, salt2)

	if bytes.Equal(key1, key2) {
		t.Errorf("Different salts produced the same key!")
	}

	passphrase1 := []byte("pass1")
	passphrase2 := []byte("pass2")
	salt := []byte("unique_salt")

	key3, _ := DeriveKey(passphrase1, salt)
	key4, _ := DeriveKey(passphrase2, salt)

	if bytes.Equal(key3, key4) {
		t.Errorf("Different passphrases produced the same key!")
	}
}

func TestDeriveKey_KnownVector(t *testing.T) {
	passphrase := []byte("known_vector_pass")
	salt := []byte("known_vector_salt")

	// Pre-calculated with scrypt params: N=32768, r=8, p=1, keyLen=32
	expectedHex := "4c3034b8d864040685e2940f80fff877cc9c4e6fd194337f2b75fe03e3f136ec"
	expected, _ := hex.DecodeString(expectedHex)

	key, err := DeriveKey(passphrase, salt)
	if err != nil {
		t.Fatalf("DeriveKey failed: %v", err)
	}

	if !bytes.Equal(key, expected) {
		t.Errorf("Known vector mismatch!\nExpected: %x\nGot:      %x", expected, key)
	}
}

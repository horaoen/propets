package smoke

import "testing"

func TestAdd(t *testing.T) {
	got := Add(1, 2)
	if got != 3 {
		t.Fatalf("Add(1, 2) = %d, want 3", got)
	}
}

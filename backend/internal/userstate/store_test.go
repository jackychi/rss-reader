package userstate

import (
	"errors"
	"testing"

	"github.com/go-sql-driver/mysql"
)

func TestIsRetryableMySQLError(t *testing.T) {
	for _, number := range []uint16{1205, 1213} {
		if !isRetryableMySQLError(&mysql.MySQLError{Number: number}) {
			t.Fatalf("expected MySQL error %d to be retryable", number)
		}
	}

	if isRetryableMySQLError(&mysql.MySQLError{Number: 1062}) {
		t.Fatal("duplicate key errors should not be retryable")
	}
	if isRetryableMySQLError(errors.New("plain error")) {
		t.Fatal("plain errors should not be retryable")
	}
}

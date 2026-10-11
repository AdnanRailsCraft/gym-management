require "test_helper"

class SqlitePragmasTest < ActiveSupport::TestCase
  test "journal mode is wal" do
    assert_equal "wal", ActiveRecord::Base.connection.select_value("PRAGMA journal_mode")
  end

  test "foreign keys enforced" do
    assert_equal 1, ActiveRecord::Base.connection.select_value("PRAGMA foreign_keys").to_i
  end

  test "schema migrations table exists" do
    assert_operator ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM schema_migrations").to_i, :>=, 0
  end
end

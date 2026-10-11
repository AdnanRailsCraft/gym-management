require "test_helper"

class HealthTest < ActionDispatch::IntegrationTest
  test "root returns ok with WAL and foreign keys active" do
    get root_path
    assert_response :success
    payload = response.parsed_body
    assert_equal "ok", payload["status"]
    assert_equal "wal", payload["journal_mode"]
    assert_equal true, payload["foreign_keys"]
    assert_operator payload["schema_migrations"], :>=, 0
  end

  test "rails health endpoint responds" do
    get "/up"
    assert_response :success
  end
end

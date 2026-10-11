require "test_helper"

class PumaLoopbackTest < ActiveSupport::TestCase
  # Loopback-only binding is a security requirement (REQUIREMENTS §2:
  # server binds 127.0.0.1, no inbound firewall rule). This guards the
  # Puma config against regressing to a wildcard bind.
  test "puma binds loopback only" do
    puma_config = File.read(Rails.root.join("config", "puma.rb"))
    assert_includes puma_config, '"127.0.0.1"', "puma must bind 127.0.0.1 explicitly"
    refute_includes puma_config, "0.0.0.0", "puma must never bind all interfaces"
  end
end

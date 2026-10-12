ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

# Loopback-only is enforced here, not by operator discipline: `rails server`
# defaults to 0.0.0.0 outside development (railties server_command.rb), so pin
# the BINDING env it reads. The desktop launcher never has to remember -b.
ENV["BINDING"] ||= "127.0.0.1"

require "bundler/setup" # Set up gems listed in the Gemfile.
require "bootsnap/setup" # Speed up boot time by caching expensive operations.

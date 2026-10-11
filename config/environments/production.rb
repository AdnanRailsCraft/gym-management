require "active_support/core_ext/integer/time"
require "fileutils"
require "securerandom"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # --- Desktop data directory -------------------------------------------
  # The desktop launcher sets GMS_DATA_DIR before starting Rails.
  # v1 default (per-machine install): %PROGRAMDATA%\GymManagementSystem
  # Never inside the install folder (%ProgramFiles% is read-only at runtime).
  data_dir = ENV["GMS_DATA_DIR"]
  if data_dir.nil? || data_dir.empty?
    raise "GMS_DATA_DIR is not set. The desktop launcher must set it before starting Rails (spec: REQUIREMENTS §33)."
  end
  %w[db logs uploads backups config].each do |subdir|
    FileUtils.mkdir_p(File.join(data_dir, subdir))
  end

  # Local machine secret: generated once on first boot, stored outside the
  # install folder, never in source control (REQUIREMENTS §34: no secrets in
  # source). Loopback-only app; signs session cookies.
  secret_file = File.join(data_dir, "config", "secret_key_base")
  unless File.exist?(secret_file)
    begin
      File.write(secret_file, SecureRandom.hex(64), mode: "wx")
    rescue Errno::EEXIST
      # another process won the race; read its value below
    end
  end
  config.secret_key_base = File.read(secret_file).strip

  # Packaged logs live with the data, rotated, outside Program Files.
  config.log_path = File.join(data_dir, "logs", "production.log")

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Turn on fragment caching in view templates.
  config.action_controller.perform_caching = true

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Loopback-only desktop app: plain HTTP on 127.0.0.1, no TLS terminator,
  # no SSL redirect (REQUIREMENTS: binds loopback, no inbound firewall rule).
  config.assume_ssl = false
  config.force_ssl = false

  # Log to the data directory with the current request id as a default log tag.
  config.log_tags = [ :request_id ]

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with a durable alternative.
  # config.cache_store = :mem_cache_store

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # config.active_job.queue_adapter = :resque

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # Enable DNS rebinding protection and other `Host` header attacks.
  # config.hosts = [
  #   "example.com",     # Allow requests from example.com
  #   /.*\.example\.com/ # Allow requests from subdomains like `www.example.com`
  # ]
  #
  # Skip DNS rebinding protection for the default health check endpoint.
  # config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end

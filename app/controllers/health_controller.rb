class HealthController < ApplicationController
  # GET / — Phase 0 smoke probe for the desktop launcher and installer checks.
  # Exposes live SQLite pragma state so an external checker can verify
  # WAL + foreign keys without shell access to the machine.
  def show
    connection = ActiveRecord::Base.connection
    render json: {
      status: "ok",
      journal_mode: connection.select_value("PRAGMA journal_mode"),
      foreign_keys: connection.select_value("PRAGMA foreign_keys").to_i == 1,
      schema_migrations: connection.select_value("SELECT COUNT(*) FROM schema_migrations").to_i
    }
  rescue StandardError => e
    Rails.logger.error("health probe failed: #{e.class}: #{e.message}")
    render json: { status: "error", error: e.class.name }, status: :service_unavailable
  end
end

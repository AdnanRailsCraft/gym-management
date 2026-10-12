# Baseline: exists so Rails maintains schema_migrations and dumps schema.rb.
# Phase 0: no tables yet; Phase 1 adds Member and friends.
class Baseline < ActiveRecord::Migration[8.1]
  def change
  end
end

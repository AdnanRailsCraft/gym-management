# frozen_string_literal: true

namespace :db do
  desc "Fail if any foreign key column lacks a matching index (PERFORMANCE.md rule)"
  task missing_indexes: :environment do
    conn = ActiveRecord::Base.connection
    ignored = %w[schema_migrations ar_internal_metadata]
    problems = []
    fk_count = 0

    conn.tables.each do |table|
      next if ignored.include?(table)
      indexes = conn.indexes(table)
      conn.foreign_keys(table).each do |fk|
        fk_count += 1
        cols = Array(fk.options[:column])
        covered = indexes.any? { |ix| ix.columns.first(cols.length) == cols }
        problems << "#{table}.#{cols.join(',')} -> #{fk.options[:to_table]}" unless covered
      end
    end

    if problems.empty?
      puts "db:missing_indexes OK (#{fk_count} foreign keys, all indexed)"
    else
      abort "db:missing_indexes FAILED:\n  " \
            "#{problems.join("\n  ")}\n" \
            "Add an index for each (PERFORMANCE.md indexing rule)."
    end
  end
end

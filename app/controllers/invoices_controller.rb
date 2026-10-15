class InvoicesController < ApplicationController
  layout "invoice"

  # GET /invoice/sample — branding/proof template for Phase 0.
  # No invoice model exists yet (empty schema); this renders the printable
  # layout with sample data so logo, address, and watermark can be verified
  # in the Tauri print preview before Phase 1 wiring.
  def sample
    @invoice_number = "INV-SAMPLE-0001"
    @issued_on = Date.current
    @member_name = "Sample Member"
    @items = [
      { description: "Monthly membership — Sample Plan", amount_cents: 5_000_00 },
      { description: "Registration fee (one-time)", amount_cents: 1_000_00 }
    ]
    @total_cents = @items.sum { |i| i[:amount_cents] }
  end
end

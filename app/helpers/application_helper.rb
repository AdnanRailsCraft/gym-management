module ApplicationHelper
  # Single edit point for gym profile strings (Phase 1 moves these to
  # gym_settings when that table lands — do not scatter literals in views).
  def gym_name
    "Gym Management System"
  end

  def gym_address
    "Location. Hassan Trade Building last Floor Near Kabal Tehsil"
  end

  def gym_logo_image
    image_tag asset_path("gym-logo.jpeg"), alt: gym_name, class: "invoice-logo"
  end

  def format_money(cents)
    format("PKR %.2f", cents / 100.0)
  end
end

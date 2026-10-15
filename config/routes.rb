Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Desktop launcher health probe: 200 + JSON when the app is serving.
  get "up" => "rails/health#show", as: :rails_health_check

  # Phase 0 smoke endpoint.
  root "health#show"

  # Printable invoice proof template (Phase 0 branding check; Phase 1
  # replaces sample data with real invoice rows).
  get "invoice/sample" => "invoices#sample", as: :sample_invoice

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
end

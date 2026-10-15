require "test_helper"

class InvoicesControllerTest < ActionDispatch::IntegrationTest
  test "sample invoice renders branding" do
    get sample_invoice_url
    assert_response :success
    assert_select "img.invoice-logo"
    assert_select "img.invoice-watermark"
    assert_select ".invoice-address", text: /Hassan Trade Building/
    assert_select ".invoice-items tfoot", text: /PKR 6000\.00/
    assert_match "SAMPLE", response.body
  end
end

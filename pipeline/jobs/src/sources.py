"""Scraping sources: one deposit folder = one raw table. Column names are the snake_case names the loader writes.

A new source = a deposit folder <source>/ in the input bucket and one entry here (no other code to write).
`page` says how the scraped page is checked: booking_url (country and name in the URL), expedia_about
(name at the start of the description) or None (no page to check).
"""

SOURCES = {
    "booking_equipements": {
        "rid": "rid", "name": "hotel", "city": "ville", "brand": "brand", "country": "pays",
        "page": "booking_url", "url": "url_booking",
    },
    "booking_piscines": {
        "rid": "establishment_distribution_code", "name": "establishment_name", "city": "geographic_8_city",
        "brand": "brand_8_operating_brand", "country": "geographic_5_country",
        "page": None, "url": None,
    },
    "expedia": {
        "rid": "establishment_distribution_code", "name": "input_hotel_name", "city": "input_city",
        "brand": "brand", "country": None,
        "page": "expedia_about", "url": None, "about": "property_about",
    },
}

# PIM identity fields read by the matching and the judge (raw.pim_product columns)
PIM_IDENTITY = {
    "rid": "ProductRid", "name": "ProductName", "commercial_name": "ProductCommercialName",
    "brand": "ProductBrand", "old_brand": "ProductOldBrand", "rebranding_date": "ProductRebrandingDate",
    "city": "ProductAddressCity", "country": "ProductAddressCountry", "address": "ProductAddressLine1",
    "zip": "ProductZipCode", "status": "ProductSalesStatus",
}

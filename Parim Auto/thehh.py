import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

URLS = [
    "https://handdservices.co.uk/the-event-steward/",
    "https://handdservices.co.uk/sia-security/",
    "https://handdservices.co.uk/sia-door-supervisor/",
    "https://handdservices.co.uk/sia-cctv/",
    "https://handdservices.co.uk/sia-close-protection/",
    "https://handdservices.co.uk/response-officer/",
    "https://handdservices.co.uk/mobile-patrol-driver/",
    "https://handdservices.co.uk/fire-marshal/",
    "https://handdservices.co.uk/dog-handler/",
    "https://handdservices.co.uk/pit-officer/",
    "https://handdservices.co.uk/event-steward-sia-door-supervisor-newmarket/",
    "https://handdservices.co.uk/picker-and-packer/",
    "https://handdservices.co.uk/warehouse-supervisor/",
    "https://handdservices.co.uk/retruns-assitant",
    "https://handdservices.co.uk/daily-package-dispatch",
    "https://handdservices.co.uk/loader-unloader/",
    "https://handdservices.co.uk/forklift-driver/",
    "https://handdservices.co.uk/reach-driver/",
    "https://handdservices.co.uk/flexi-bendi-driver/",
    "https://handdservices.co.uk/Waste-collector",
    "https://handdservices.co.uk/van-driver",
    "https://handdservices.co.uk/general-warehouse-operative",
    "https://handdservices.co.uk/warehouse-operatives/",
    "https://handdservices.co.uk/general-operative-driver",
    "https://handdservices.co.uk/drivers-lotushatfield-to-london",
    "https://handdservices.co.uk/office-admin-or-administrator/",
    "https://handdservices.co.uk/concierge",
    "https://handdservices.co.uk/receptionist/",
    "https://handdservices.co.uk/customer-support-specialist/",
    "https://handdservices.co.uk/housekeeper/",
    "https://handdservices.co.uk/linen-porter",
    "https://handdservices.co.uk/public-area-cleaner/",
    "https://handdservices.co.uk/room-attendant/",
    "https://handdservices.co.uk/housekeeping-supervisor/",
    "https://handdservices.co.uk/housekeeper/",
    "https://handdservices.co.uk/kitchen-porter/",
    "https://handdservices.co.uk/room-service-attendant/",
    "https://handdservices.co.uk/bartender/",
    "https://handdservices.co.uk/front-desk-receptionist/",
    "https://handdservices.co.uk/office-admin-or-administrator/",
    "https://handdservices.co.uk/luggage-porter",
    "https://handdservices.co.uk/waiter-waitress-2/",
    "https://handdservices.co.uk/prep-chef",
    "https://handdservices.co.uk/line-chef",
    "https://handdservices.co.uk/senior-chef/",
    "https://handdservices.co.uk/sous-chef/",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

seen_pages = set()

for url in URLS:
    if url in seen_pages:
        continue

    seen_pages.add(url)

    try:
        response = requests.get(url, headers=HEADERS, timeout=20)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        apply_link = None

        sidebar_cards = soup.select("div.sidebar-card")

        for card in sidebar_cards:
            heading = card.find("h3")

            if heading and "Job Summary" in heading.get_text(strip=True):
                button = card.select_one("a.apply-btn")

                if button and button.get("href"):
                    apply_link = urljoin(url, button["href"])
                    break

        if apply_link:
            print(apply_link)
        else:
            print(f"No apply link found: {url}")

    except requests.RequestException as e:
        print(f"Error opening {url}: {e}")
(function ($) {
	"use strict";

	const body = document.body;
	const offcanvas = document.querySelector(".wa-offcanvas-area");
	const overlay = document.querySelector(".wa-overly");
	const openButtons = document.querySelectorAll(".offcanvas_toggle, .as-header-1-menu-toggle-btn");
	const closeButton = document.querySelector(".offcanvas_box_close");

	const setMenuState = (isOpen) => {
		if (!offcanvas) return;
		offcanvas.classList.toggle("active", isOpen);
		offcanvas.setAttribute("aria-hidden", isOpen ? "false" : "true");
		body.classList.toggle("offcanvas-open", isOpen);
		openButtons.forEach((button) => button.setAttribute("aria-expanded", isOpen ? "true" : "false"));
	};

	openButtons.forEach((button) => {
		button.addEventListener("click", () => setMenuState(true));
	});

	if (closeButton) {
		closeButton.addEventListener("click", () => setMenuState(false));
	}

	if (overlay) {
		overlay.addEventListener("click", () => setMenuState(false));
	}

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") setMenuState(false);
	});

	document.querySelectorAll(".mobile-main-navigation a").forEach((link) => {
		link.addEventListener("click", () => setMenuState(false));
	});

	const backToTop = document.querySelector(".wa_backToTop");
	if (backToTop) {
		backToTop.setAttribute("role", "button");
		backToTop.setAttribute("tabindex", "0");
		backToTop.setAttribute("aria-label", "Back to top");

		const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
		backToTop.addEventListener("click", scrollTop);
		backToTop.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") scrollTop();
		});
	}

	$(".as-accordion-item .item-title").each(function () {
		const button = $(this);
		button.attr({
			role: "button",
			tabindex: "0",
		});
		button.on("keydown", function (event) {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				button.trigger("click");
			}
		});
	});
})(jQuery);

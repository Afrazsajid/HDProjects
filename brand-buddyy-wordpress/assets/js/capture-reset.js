(function () {
	"use strict";

	if (window.jQuery && !window.jQuery.fn.counterUp) {
		window.jQuery.fn.counterUp = function () {
			return this.each(function () {
				const element = window.jQuery(this);
				const value = element.attr("data-count") || element.text();
				element.text(value);
			});
		};
	}

	document.querySelectorAll(".pin-spacer").forEach((spacer) => {
		const child = spacer.firstElementChild;
		if (!child || !spacer.parentNode) return;

		[
			"transform",
			"translate",
			"rotate",
			"scale",
			"inset",
			"position",
			"width",
			"max-width",
			"height",
			"max-height",
			"margin",
			"padding",
		].forEach((property) => child.style.removeProperty(property));

		spacer.parentNode.replaceChild(child, spacer);
	});

	document.querySelectorAll(".p1_ani_elm").forEach((element) => {
		element.style.removeProperty("transform");
		element.style.removeProperty("translate");
		element.style.removeProperty("rotate");
		element.style.removeProperty("scale");
	});

	document.querySelectorAll(".js-marquee-wrapper").forEach((wrapper) => {
		const marquee = wrapper.querySelector(".js-marquee");
		const host = wrapper.parentElement;
		if (marquee && host) {
			host.innerHTML = marquee.innerHTML;
		}
	});
})();

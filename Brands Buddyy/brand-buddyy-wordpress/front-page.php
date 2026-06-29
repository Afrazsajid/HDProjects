<?php
/**
 * Static front page template.
 *
 * @package Brand_Buddyy
 */

get_header();

$sections = array(
	'hero',
	'about',
	'capabilities',
	'marquee',
	'benefits',
	'partners',
	'services',
	'portfolio',
	'primary-cta',
	'testimonials',
	'engagements',
	'process',
	'faqs',
	'contact',
	'insights',
);

foreach ( $sections as $section ) {
	get_template_part( 'template-parts/home/' . $section );
}

get_footer();

<?php
/**
 * Required fallback template.
 *
 * @package Brand_Buddyy
 */

get_header();

get_template_part(
	'template-parts/global/page-hero',
	null,
	array(
		'eyebrow' => __( 'Brand Buddyy', 'brand-buddyy' ),
		'title'   => __( 'Latest content', 'brand-buddyy' ),
	)
);
get_template_part( 'template-parts/blog/archive-loop' );

get_footer();

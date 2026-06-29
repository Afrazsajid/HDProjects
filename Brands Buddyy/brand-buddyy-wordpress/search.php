<?php
/**
 * Search results.
 *
 * @package Brand_Buddyy
 */

get_header();

get_template_part(
	'template-parts/global/page-hero',
	null,
	array(
		'eyebrow' => __( 'Search results', 'brand-buddyy' ),
		'title'   => sprintf(
			/* translators: %s: Search query. */
			__( 'Results for “%s”', 'brand-buddyy' ),
			esc_html( get_search_query() )
		),
	)
);
get_template_part( 'template-parts/blog/archive-loop' );

get_footer();

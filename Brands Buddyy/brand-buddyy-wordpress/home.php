<?php
/**
 * Posts archive.
 *
 * @package Brand_Buddyy
 */

get_header();

$posts_page_id = (int) get_option( 'page_for_posts' );
$title         = $posts_page_id ? get_the_title( $posts_page_id ) : __( 'Insights', 'brand-buddyy' );

get_template_part(
	'template-parts/global/page-hero',
	null,
	array(
		'eyebrow' => __( 'Useful thinking', 'brand-buddyy' ),
		'title'   => $title,
	)
);
get_template_part( 'template-parts/blog/archive-loop' );

get_footer();

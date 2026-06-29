<?php
/**
 * Category, tag, author, and date archives.
 *
 * @package Brand_Buddyy
 */

get_header();

get_template_part(
	'template-parts/global/page-hero',
	null,
	array(
		'eyebrow' => __( 'Explore the archive', 'brand-buddyy' ),
		'title'   => get_the_archive_title(),
	)
);
get_template_part( 'template-parts/blog/archive-loop' );

get_footer();

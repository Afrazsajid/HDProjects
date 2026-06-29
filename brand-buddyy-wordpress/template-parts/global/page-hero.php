<?php
/**
 * Shared internal page hero.
 *
 * @package Brand_Buddyy
 */

$eyebrow = isset( $args['eyebrow'] ) ? $args['eyebrow'] : __( 'Brand Buddyy', 'brand-buddyy' );
$title   = isset( $args['title'] ) ? $args['title'] : get_the_title();
?>
<section class="bb-page-hero">
	<div class="bb-page-hero__inner">
		<p class="bb-eyebrow"><?php echo esc_html( $eyebrow ); ?></p>
		<h1 class="bb-page-title"><?php echo wp_kses_post( $title ); ?></h1>
	</div>
</section>

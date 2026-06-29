<?php
/**
 * Not found template.
 *
 * @package Brand_Buddyy
 */

get_header();
?>
<section class="bb-page-hero">
	<div class="bb-page-hero__inner">
		<p class="bb-eyebrow"><?php esc_html_e( '404 — Page not found', 'brand-buddyy' ); ?></p>
		<h1 class="bb-page-title"><?php esc_html_e( 'This page wandered off.', 'brand-buddyy' ); ?></h1>
	</div>
</section>
<div class="bb-content-shell">
	<div class="bb-empty-state">
		<h2><?php esc_html_e( 'Let’s get you somewhere useful.', 'brand-buddyy' ); ?></h2>
		<p><?php esc_html_e( 'The address may have changed, or the page may no longer exist.', 'brand-buddyy' ); ?></p>
		<p><a class="bb-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Return home', 'brand-buddyy' ); ?></a></p>
		<?php get_search_form(); ?>
	</div>
</div>
<?php
get_footer();

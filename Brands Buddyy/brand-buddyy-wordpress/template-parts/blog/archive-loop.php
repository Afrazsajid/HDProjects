<?php
/**
 * Shared archive loop.
 *
 * @package Brand_Buddyy
 */
?>
<div class="bb-content-shell">
	<?php if ( have_posts() ) : ?>
		<div class="bb-post-grid">
			<?php
			while ( have_posts() ) {
				the_post();
				get_template_part( 'template-parts/blog/card' );
			}
			?>
		</div>
		<nav class="bb-pagination" aria-label="<?php esc_attr_e( 'Posts pagination', 'brand-buddyy' ); ?>">
			<?php
			the_posts_pagination(
				array(
					'mid_size'  => 2,
					'prev_text' => __( 'Previous', 'brand-buddyy' ),
					'next_text' => __( 'Next', 'brand-buddyy' ),
				)
			);
			?>
		</nav>
	<?php else : ?>
		<div class="bb-empty-state">
			<h2><?php esc_html_e( 'Nothing matched yet.', 'brand-buddyy' ); ?></h2>
			<p><?php esc_html_e( 'Try a different search or browse another part of the site.', 'brand-buddyy' ); ?></p>
			<?php get_search_form(); ?>
		</div>
	<?php endif; ?>
</div>

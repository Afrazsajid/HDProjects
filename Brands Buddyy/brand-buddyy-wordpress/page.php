<?php
/**
 * Standard page template.
 *
 * @package Brand_Buddyy
 */

get_header();

while ( have_posts() ) :
	the_post();
	get_template_part(
		'template-parts/global/page-hero',
		null,
		array(
			'eyebrow' => brand_buddyy_field( 'page_eyebrow', __( 'Brand Buddyy', 'brand-buddyy' ) ),
			'title'   => get_the_title(),
		)
	);
	?>
	<div class="bb-content-shell bb-standard-page">
		<article id="post-<?php the_ID(); ?>" <?php post_class( 'bb-article' ); ?>>
			<?php if ( has_post_thumbnail() ) : ?>
				<figure class="bb-article__featured">
					<?php the_post_thumbnail( 'full' ); ?>
				</figure>
			<?php endif; ?>
			<div class="bb-article__content">
				<?php the_content(); ?>
			</div>
		</article>
	</div>
	<?php
endwhile;

get_footer();

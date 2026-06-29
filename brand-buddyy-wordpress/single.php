<?php
/**
 * Single post template.
 *
 * @package Brand_Buddyy
 */

get_header();

while ( have_posts() ) :
	the_post();
	?>
	<section class="bb-page-hero">
		<div class="bb-page-hero__inner">
			<div class="bb-article-meta">
				<span><?php echo esc_html( get_the_date() ); ?></span>
				<span>
					<?php
					printf(
						/* translators: %s: Author display name. */
						esc_html__( 'By %s', 'brand-buddyy' ),
						esc_html( get_the_author() )
					);
					?>
				</span>
				<span><?php the_category( ', ' ); ?></span>
			</div>
			<h1 class="bb-page-title"><?php the_title(); ?></h1>
		</div>
	</section>

	<div class="bb-content-shell">
		<article id="post-<?php the_ID(); ?>" <?php post_class( 'bb-article' ); ?>>
			<?php if ( has_post_thumbnail() ) : ?>
				<figure class="bb-article__featured">
					<?php the_post_thumbnail( 'full', array( 'fetchpriority' => 'high' ) ); ?>
				</figure>
			<?php endif; ?>

			<div class="bb-article__content">
				<?php
				the_content();
				wp_link_pages(
					array(
						'before' => '<nav class="bb-pagination">' . esc_html__( 'Pages:', 'brand-buddyy' ),
						'after'  => '</nav>',
					)
				);
				?>
			</div>

			<?php
			$tags = get_the_tags();
			if ( $tags ) :
				?>
				<div class="bb-tags" aria-label="<?php esc_attr_e( 'Post tags', 'brand-buddyy' ); ?>">
					<?php
					foreach ( $tags as $tag ) {
						printf(
							'<a href="%1$s">%2$s</a>',
							esc_url( get_tag_link( $tag ) ),
							esc_html( $tag->name )
						);
					}
					?>
				</div>
			<?php endif; ?>
		</article>

		<?php
		$categories = wp_get_post_categories( get_the_ID() );
		$related    = new WP_Query(
			array(
				'post_type'           => 'post',
				'post_status'         => 'publish',
				'posts_per_page'      => 2,
				'post__not_in'        => array( get_the_ID() ),
				'category__in'        => $categories,
				'ignore_sticky_posts' => true,
			)
		);

		if ( $related->have_posts() ) :
			?>
			<section class="bb-related">
				<h2 class="bb-related__title"><?php esc_html_e( 'Related thinking', 'brand-buddyy' ); ?></h2>
				<div class="bb-post-grid">
					<?php
					while ( $related->have_posts() ) {
						$related->the_post();
						get_template_part( 'template-parts/blog/card' );
					}
					?>
				</div>
			</section>
			<?php
			wp_reset_postdata();
		endif;
		?>
	</div>
	<?php
endwhile;

get_footer();

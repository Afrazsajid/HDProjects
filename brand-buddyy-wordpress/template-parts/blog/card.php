<?php
/**
 * Blog card.
 *
 * @package Brand_Buddyy
 */
?>
<article id="post-<?php the_ID(); ?>" <?php post_class( 'bb-post-card wow fadeInUp2' ); ?>>
	<a class="bb-post-card__image" href="<?php the_permalink(); ?>" aria-label="<?php echo esc_attr( get_the_title() ); ?>">
		<?php
		if ( has_post_thumbnail() ) {
			the_post_thumbnail(
				'brand-buddyy-card',
				array(
					'loading' => 'lazy',
					'alt'     => the_title_attribute( array( 'echo' => false ) ),
				)
			);
		} else {
			printf(
				'<img src="%1$s" alt="" loading="lazy">',
				esc_url( brand_buddyy_asset( 'images/b1_img_1.webp' ) )
			);
		}
		?>
	</a>
	<div class="bb-post-card__body">
		<div class="bb-post-card__meta">
			<span><?php echo esc_html( get_the_date() ); ?></span>
			<span><?php the_category( ', ' ); ?></span>
		</div>
		<h2 class="bb-post-card__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
		<div class="bb-post-card__excerpt"><?php echo esc_html( wp_trim_words( get_the_excerpt(), 28 ) ); ?></div>
		<a class="bb-text-link" href="<?php the_permalink(); ?>"><?php esc_html_e( 'Read article', 'brand-buddyy' ); ?></a>
	</div>
</article>

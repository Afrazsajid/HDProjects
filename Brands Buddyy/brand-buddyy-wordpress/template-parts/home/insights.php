<?php
/**
 * Homepage insights powered by WordPress posts.
 *
 * @package Brand_Buddyy
 */

$posts = new WP_Query(
	array(
		'post_type'           => 'post',
		'post_status'         => 'publish',
		'posts_per_page'      => 2,
		'ignore_sticky_posts' => true,
	)
);
$posts_page_id = (int) get_option( 'page_for_posts' );
$posts_url     = $posts_page_id ? get_permalink( $posts_page_id ) : home_url( '/?post_type=post' );
?>
<section id="insights" class="as-blog-1-area pt-90 pb-105 tx-section">
	<div class="as-blog-1-container">
		<div class="as-blog-1-sec-title mb-40">
			<div class="left">
				<h6 class="tx-subTitle"><?php echo esc_html( brand_buddyy_field( 'insights_eyebrow', __( 'Useful thinking', 'brand-buddyy' ) ) ); ?></h6>
				<h2 class="tx-title as-h-1"><?php echo esc_html( brand_buddyy_field( 'insights_title', __( 'Practical ideas for stronger digital growth decisions', 'brand-buddyy' ) ) ); ?></h2>
			</div>
			<div class="right">
				<p class="tx-description as-p-1"><?php echo esc_html( brand_buddyy_field( 'insights_description', __( 'Clear guidance for businesses planning their next website, system or campaign.', 'brand-buddyy' ) ) ); ?></p>
				<a href="<?php echo esc_url( $posts_url ); ?>" class="as-pr-btn-1-v2 tx-button">
					<span class="text"><?php esc_html_e( 'More insights', 'brand-buddyy' ); ?></span>
				</a>
			</div>
		</div>

		<?php if ( $posts->have_posts() ) : ?>
			<div class="as-blog-1-wrap">
				<?php
				$index = 0;
				while ( $posts->have_posts() ) :
					$posts->the_post();
					if ( 0 === $index ) :
						?>
						<div class="as-blog-1-left wa-fix wa_magnetic_1_trigger">
							<a class="as-blog-1-left-bg-img wa-img-cover" href="<?php the_permalink(); ?>">
								<?php
								if ( has_post_thumbnail() ) {
									the_post_thumbnail( 'brand-buddyy-card', array( 'loading' => 'lazy' ) );
								}
								?>
							</a>
							<div class="as-blog-1-left-content">
								<div class="categories"><?php the_category( ', ' ); ?></div>
								<h3 class="title as-h-1"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
								<p class="disc as-p-1"><?php echo esc_html( wp_trim_words( get_the_excerpt(), 24 ) ); ?></p>
								<a href="<?php the_permalink(); ?>" class="as-pr-btn-1-v2"><span class="text"><?php esc_html_e( 'Read article', 'brand-buddyy' ); ?></span></a>
							</div>
						</div>
						<div class="as-blog-1-right">
						<?php
					else :
						?>
						<article class="as-blog-1-item wa_magnetic_1_trigger">
							<a class="item-img wa-fix wa-img-cover" href="<?php the_permalink(); ?>">
								<?php
								if ( has_post_thumbnail() ) {
									the_post_thumbnail( 'brand-buddyy-card', array( 'loading' => 'lazy', 'class' => 'wa_magnetic_1_elm' ) );
								}
								?>
							</a>
							<div class="content-wrap">
								<div class="categories"><?php the_category( ', ' ); ?></div>
								<h3 class="title as-h-1"><a class="wa-line-limit has-line-2" href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
								<p class="disc as-p-1"><?php echo esc_html( wp_trim_words( get_the_excerpt(), 20 ) ); ?></p>
								<a href="<?php the_permalink(); ?>" class="as-pr-btn-1-v2"><span class="text"><?php esc_html_e( 'Read article', 'brand-buddyy' ); ?></span></a>
							</div>
						</article>
						<?php
					endif;
					++$index;
				endwhile;

				if ( $index > 1 ) {
					echo '</div>';
				}
				?>
			</div>
		<?php else : ?>
			<div class="bb-empty-state">
				<h3><?php esc_html_e( 'Insights are coming soon.', 'brand-buddyy' ); ?></h3>
				<p><?php esc_html_e( 'Publish WordPress posts and the latest two will appear here automatically.', 'brand-buddyy' ); ?></p>
			</div>
		<?php endif; ?>
	</div>
</section>
<?php wp_reset_postdata(); ?>

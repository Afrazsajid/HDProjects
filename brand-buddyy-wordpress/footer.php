<?php
/**
 * Site footer.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$email       = brand_buddyy_option( 'footer_email', 'hello@brandbuddyy.com' );
$description = brand_buddyy_option(
	'footer_newsletter_description',
	__( 'Occasional practical insights on websites, automation, advertising and digital growth.', 'brand-buddyy' )
);
$footer_bg   = brand_buddyy_image_url( brand_buddyy_option( 'footer_background' ), 'full', brand_buddyy_asset( 'images/f1-bg-img.webp' ) );
?>
	</main>

	<footer class="as-footer-1-area wa-bg-default pt-95 pb-120 tx-section" style="background-image: url('<?php echo esc_url( $footer_bg ); ?>');">
		<div class="as-footer-1-container">
			<div class="as-footer-1-wrap mb-90">
				<div class="as-footer-1-widget">
					<div class="as-footer-1-newsletter">
						<h3 class="as-footer-1-widget-title as-h-1"><?php echo esc_html( brand_buddyy_option( 'footer_newsletter_title', __( 'Useful ideas, occasionally.', 'brand-buddyy' ) ) ); ?></h3>
						<p class="tx-description"><?php echo esc_html( $description ); ?></p>
						<form class="as-footer-1-newsletter-form wa-p-relative" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
							<input type="hidden" name="action" value="brand_buddyy_newsletter">
							<?php wp_nonce_field( 'brand_buddyy_newsletter', 'brand_buddyy_newsletter_nonce' ); ?>
							<label class="screen-reader-text" for="brand-buddyy-newsletter-email"><?php esc_html_e( 'Email address', 'brand-buddyy' ); ?></label>
							<input id="brand-buddyy-newsletter-email" class="as-footer-1-newsletter-form-input wa_placeholder" type="email" name="newsletter_email" placeholder="<?php esc_attr_e( 'Email Address', 'brand-buddyy' ); ?>" required>
							<button type="submit" class="as-footer-1-newsletter-form-btn as-pr-btn-1">
								<span class="text"><?php esc_html_e( 'Subscribe', 'brand-buddyy' ); ?></span>
							</button>
						</form>
					</div>
				</div>

				<div class="as-footer-1-widget">
					<h3 class="as-footer-1-widget-title as-h-1"><?php esc_html_e( 'Quick Navigation', 'brand-buddyy' ); ?></h3>
					<?php
					wp_nav_menu(
						array(
							'theme_location' => 'footer_quick',
							'container'      => false,
							'menu_class'     => 'wa-ul as-footer-1-menu bb-footer-menu',
							'fallback_cb'    => 'brand_buddyy_default_menu',
						)
					);
					?>
				</div>

				<div class="as-footer-1-widget">
					<h3 class="as-footer-1-widget-title as-h-1"><?php esc_html_e( 'Pages', 'brand-buddyy' ); ?></h3>
					<?php
					wp_nav_menu(
						array(
							'theme_location' => 'footer_pages',
							'container'      => false,
							'menu_class'     => 'wa-ul as-footer-1-menu bb-footer-menu',
							'fallback_cb'    => 'brand_buddyy_default_menu',
						)
					);
					?>
				</div>

				<div class="as-footer-1-widget">
					<h3 class="as-footer-1-widget-title as-h-1"><?php esc_html_e( 'Social Media', 'brand-buddyy' ); ?></h3>
					<ul class="wa-ul as-footer-1-menu bb-footer-menu">
						<?php get_template_part( 'template-parts/global/social-menu-items' ); ?>
					</ul>
				</div>

				<div class="as-footer-1-widget">
					<a href="mailto:<?php echo esc_attr( sanitize_email( $email ) ); ?>" class="as-footer-1-big-email as-p-1">
						<?php echo esc_html( $email ); ?>
					</a>
				</div>
			</div>

			<div class="as-footer-1-bottom-logo">
				<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="as-footer-1-logo wa-fix tx-logo">
					<?php brand_buddyy_logo(); ?>
				</a>
			</div>

			<div class="as-footer-1-bottom">
				<p class="as-footer-1-copyright as-p-1">
					<?php
					printf(
						/* translators: %s: Current year. */
						esc_html__( '© Brand Buddyy %s. All rights reserved.', 'brand-buddyy' ),
						esc_html( wp_date( 'Y' ) )
					);
					?>
				</p>
				<p class="as-footer-1-make as-p-1"><?php echo esc_html( brand_buddyy_option( 'footer_small_print', __( 'Built with care for useful digital growth.', 'brand-buddyy' ) ) ); ?></p>
				<div class="as-footer-1-bottom-link">
					<?php
					wp_nav_menu(
						array(
							'theme_location' => 'footer_legal',
							'container'      => false,
							'menu_class'     => 'bb-footer-menu',
							'fallback_cb'    => false,
						)
					);
					?>
				</div>
			</div>
		</div>
	</footer>
</div>
<div class="wa-cursor"><div class="wa-cursor-text"></div></div>
<?php wp_footer(); ?>
</body>
</html>

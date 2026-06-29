<?php
/**
 * Site header.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$cta_text = brand_buddyy_option( 'header_cta_text', __( 'Start your project', 'brand-buddyy' ) );
$cta_url  = brand_buddyy_option( 'header_cta_url', brand_buddyy_front_page_url( 'contact' ) );
?>
<!doctype html>
<html <?php language_attributes(); ?> class="lenis lenis-smooth">
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="screen-reader-text" href="#primary"><?php esc_html_e( 'Skip to content', 'brand-buddyy' ); ?></a>
<div class="page-wrapper">
	<div class="wa-back-to-top wa_backToTop" aria-hidden="true">
		<span>↑</span>
	</div>

	<header class="as-header-1-area tx-header wa_sticky_header">
		<div class="container as-container-1 text-right">
			<div class="as-header-1-wrap">
				<nav class="as-main-navigation as-header-1-menu d-none d-lg-block" aria-label="<?php esc_attr_e( 'Primary navigation', 'brand-buddyy' ); ?>">
					<?php
					wp_nav_menu(
						array(
							'theme_location' => 'primary',
							'container'      => false,
							'menu_class'     => 'menu nav navbar-nav menu_1_split',
							'fallback_cb'    => 'brand_buddyy_default_menu',
						)
					);
					?>
				</nav>

				<button class="as-header-1-menu-toggle-btn offcanvas_toggle" type="button" aria-expanded="false" aria-controls="brand-buddyy-mobile-menu">
					<span></span>
					<span></span>
					<span class="screen-reader-text"><?php esc_html_e( 'Open menu', 'brand-buddyy' ); ?></span>
				</button>

				<div class="as-header-1-action-link">
					<a href="<?php echo esc_url( $cta_url ); ?>" class="as-pr-btn-1 wa_btn_split_1 wa_magnetic_btn_1">
						<span class="text"><?php echo esc_html( $cta_text ); ?></span>
					</a>
				</div>
			</div>
		</div>

		<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="as-header-1-logo" aria-label="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?>">
			<?php brand_buddyy_logo(); ?>
		</a>
	</header>

	<div id="brand-buddyy-mobile-menu" class="wa-offcanvas-area offcanvas_box_active" aria-hidden="true">
		<div class="wa-offcanvas-wrap">
			<div class="wa-offcanvas-top">
				<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="tx-logo wa-offcanvas-top-logo">
					<?php brand_buddyy_logo(); ?>
				</a>
				<button class="wa-offcanvas-close offcanvas_box_close" type="button" aria-label="<?php esc_attr_e( 'Close menu', 'brand-buddyy' ); ?>">
					<span></span>
					<span></span>
				</button>
			</div>

			<nav class="mobile-main-navigation mb-50 d-block" aria-label="<?php esc_attr_e( 'Mobile navigation', 'brand-buddyy' ); ?>">
				<?php
				wp_nav_menu(
					array(
						'theme_location' => has_nav_menu( 'mobile' ) ? 'mobile' : 'primary',
						'container'      => false,
						'menu_class'     => 'menu nav navbar-nav clearfix list-unstyled',
						'fallback_cb'    => 'brand_buddyy_default_menu',
					)
				);
				?>
			</nav>

			<div class="wa-offcanvas-social">
				<h6 class="wa-offcanvas-social-title as-h-1"><?php esc_html_e( 'Find us online', 'brand-buddyy' ); ?></h6>
				<div class="wa-offcanvas-social-flex d-flex flex-wrap">
					<?php get_template_part( 'template-parts/global/social-links' ); ?>
				</div>
			</div>
		</div>
	</div>
	<div class="wa-overly"></div>
	<main id="primary">

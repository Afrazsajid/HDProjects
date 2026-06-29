<?php
/**
 * Theme asset registration.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue the preserved design system and theme scripts.
 */
function brand_buddyy_enqueue_assets() {
	$vendor = 'vendor/wp/avista/wp_content/';
	$theme  = $vendor . 'themes/avista/';
	$core   = $vendor . 'plugins/avista_core/';

	$styles = array(
		'brand-buddyy-fonts'             => 'fonts/google-fonts.css',
		'brand-buddyy-element-helper'    => $core . 'assets/css/elh_element.css',
		'brand-buddyy-animate'           => $theme . 'assets/css/animate_min.css',
		'brand-buddyy-bootstrap'         => $theme . 'assets/css/bootstrap.min.css',
		'brand-buddyy-magnific'          => $theme . 'assets/css/magnific_popup.css',
		'brand-buddyy-nice-select'       => $theme . 'assets/css/nice_select.css',
		'brand-buddyy-swiper'            => $theme . 'assets/css/swiper.min.css',
		'brand-buddyy-fontawesome'       => $theme . 'assets/css/fontawesome_min.css',
		'brand-buddyy-odometer'          => $theme . 'assets/css/odometer.min.css',
		'brand-buddyy-avista-core'       => $theme . 'assets/css/avista_core.css',
		'brand-buddyy-avista-companion'  => $theme . 'assets/css/avista_companion.css',
		'brand-buddyy-avista-extra'      => $theme . 'assets/css/avista_extra.css',
		'brand-buddyy-avista-custom'     => $theme . 'assets/css/avista_custom.css',
		'brand-buddyy-avista-style'      => $theme . 'style.css',
		'brand-buddyy-elementor'         => $vendor . 'plugins/elementor/assets/css/frontend.min.css',
		'brand-buddyy-elementor-kit'     => $vendor . 'uploads/elementor/css/post_7.css',
		'brand-buddyy-elementor-home'    => $vendor . 'uploads/elementor/css/post_15.css',
		'brand-buddyy-capture-inline'    => 'css/inline-styles.css',
		'brand-buddyy-brand-overrides'   => 'css/brand-buddyy.css',
	);

	$previous = array();
	foreach ( $styles as $handle => $path ) {
		wp_enqueue_style( $handle, brand_buddyy_asset( $path ), $previous, BRAND_BUDDYY_VERSION );
		$previous = array( $handle );
	}
	wp_enqueue_style( 'brand-buddyy-style', get_stylesheet_uri(), $previous, BRAND_BUDDYY_VERSION );

	$scripts = array(
		'brand-buddyy-bootstrap-js'  => array( $theme . 'assets/js/bootstrap_min.js', array( 'jquery' ) ),
		'brand-buddyy-swiper-js'     => array( $theme . 'assets/js/swiper.min.js', array() ),
		'brand-buddyy-lenis'         => array( $theme . 'assets/js/lenis.min.js', array() ),
		'brand-buddyy-wow'           => array( $theme . 'assets/js/wow_min.js', array() ),
		'brand-buddyy-odometer'      => array( $theme . 'assets/js/odometer.min.js', array( 'jquery' ) ),
		'brand-buddyy-nice-select'   => array( $theme . 'assets/js/nice_select.min.js', array( 'jquery' ) ),
		'brand-buddyy-marquee'       => array( $theme . 'assets/js/jquery.marquee.min.js', array( 'jquery' ) ),
		'brand-buddyy-magnific'      => array( $theme . 'assets/js/magnific_popup.min.js', array( 'jquery' ) ),
		'brand-buddyy-splittext'     => array( $theme . 'assets/js/splittext.min.js', array() ),
		'brand-buddyy-gsap'          => array( $theme . 'assets/js/gsap.min.js', array() ),
		'brand-buddyy-custom-ease'   => array( $theme . 'assets/js/customease.min.js', array( 'brand-buddyy-gsap' ) ),
		'brand-buddyy-appear'        => array( $theme . 'assets/js/appear.js', array( 'jquery' ) ),
		'brand-buddyy-scrolltrigger' => array( $theme . 'assets/js/scrolltrigger.min.js', array( 'brand-buddyy-gsap' ) ),
		'brand-buddyy-pixi'          => array( $theme . 'assets/js/pixi.min.js', array() ),
		'brand-buddyy-cursor'        => array( $theme . 'assets/js/cursor.js', array( 'jquery' ) ),
		'brand-buddyy-touchspin'     => array( $theme . 'assets/js/touchspin.js', array( 'jquery' ) ),
		'brand-buddyy-capture-reset' => array( 'js/capture-reset.js', array() ),
		'brand-buddyy-avista-core-js'=> array( $theme . 'assets/js/avista_core.js', array( 'jquery', 'brand-buddyy-lenis', 'brand-buddyy-gsap', 'brand-buddyy-scrolltrigger', 'brand-buddyy-pixi', 'brand-buddyy-capture-reset' ) ),
	);

	foreach ( $scripts as $handle => $definition ) {
		wp_enqueue_script( $handle, brand_buddyy_asset( $definition[0] ), $definition[1], BRAND_BUDDYY_VERSION, true );
	}

	if ( is_front_page() ) {
		wp_enqueue_script(
			'brand-buddyy-fallback-content',
			brand_buddyy_asset( 'js/brand-buddyy-fallback.js' ),
			array( 'brand-buddyy-avista-core-js' ),
			BRAND_BUDDYY_VERSION,
			true
		);
		wp_enqueue_script(
			'brand-buddyy-home-content',
			brand_buddyy_asset( 'js/home-content.js' ),
			array( 'brand-buddyy-fallback-content' ),
			BRAND_BUDDYY_VERSION,
			true
		);
		wp_localize_script( 'brand-buddyy-home-content', 'brandBuddyyTheme', brand_buddyy_home_content_data() );
	}

	wp_enqueue_script(
		'brand-buddyy-theme',
		brand_buddyy_asset( 'js/theme.js' ),
		array( 'jquery' ),
		BRAND_BUDDYY_VERSION,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'brand_buddyy_enqueue_assets' );

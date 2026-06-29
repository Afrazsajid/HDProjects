<?php
/**
 * Theme setup and WordPress integrations.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register theme features.
 */
function brand_buddyy_setup() {
	load_theme_textdomain( 'brand-buddyy', BRAND_BUDDYY_PATH . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'align-wide' );
	add_theme_support( 'editor-styles' );
	add_theme_support(
		'html5',
		array(
			'comment-list',
			'comment-form',
			'search-form',
			'gallery',
			'caption',
			'style',
			'script',
		)
	);
	add_theme_support(
		'custom-logo',
		array(
			'height'      => 120,
			'width'       => 240,
			'flex-height' => true,
			'flex-width'  => true,
		)
	);

	register_nav_menus(
		array(
			'primary'       => __( 'Primary Menu', 'brand-buddyy' ),
			'mobile'        => __( 'Mobile Menu', 'brand-buddyy' ),
			'footer_quick'  => __( 'Footer Quick Navigation', 'brand-buddyy' ),
			'footer_pages'  => __( 'Footer Pages', 'brand-buddyy' ),
			'footer_legal'  => __( 'Footer Legal Menu', 'brand-buddyy' ),
		)
	);

	add_image_size( 'brand-buddyy-card', 900, 560, true );
	add_image_size( 'brand-buddyy-related', 720, 450, true );
}
add_action( 'after_setup_theme', 'brand_buddyy_setup' );

/**
 * Add the original homepage body classes used by the preserved CSS.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function brand_buddyy_body_classes( $classes ) {
	$classes[] = 'wp-embed-responsive';
	$classes[] = 'wp-theme-avista';
	$classes[] = 'theme-avista';
	$classes[] = 'no-sidebar';

	if ( is_front_page() ) {
		$classes[] = 'as-home-1';
		$classes[] = 'elementor-default';
		$classes[] = 'elementor-template-full-width';
		$classes[] = 'elementor-kit-7';
		$classes[] = 'elementor-page';
		$classes[] = 'elementor-page-15';
		$classes[] = 'elementor-15';
	}

	return array_unique( $classes );
}
add_filter( 'body_class', 'brand_buddyy_body_classes' );

/**
 * Register ACF options page when ACF Pro is active.
 */
function brand_buddyy_register_options_page() {
	if ( function_exists( 'acf_add_options_page' ) ) {
		acf_add_options_page(
			array(
				'page_title' => __( 'Brand Buddyy Theme Settings', 'brand-buddyy' ),
				'menu_title' => __( 'Theme Settings', 'brand-buddyy' ),
				'menu_slug'  => 'brand-buddyy-settings',
				'capability' => 'edit_theme_options',
				'redirect'   => false,
				'position'   => 59,
				'icon_url'   => 'dashicons-admin-customizer',
			)
		);
	}
}
add_action( 'acf/init', 'brand_buddyy_register_options_page' );

/**
 * Register free global settings in the native WordPress Customizer.
 *
 * @param WP_Customize_Manager $customizer Customizer manager.
 */
function brand_buddyy_customize_register( $customizer ) {
	$customizer->add_panel(
		'brand_buddyy_settings',
		array(
			'title'       => __( 'Brand Buddyy Settings', 'brand-buddyy' ),
			'description' => __( 'Edit the global header, footer, contact, and social content.', 'brand-buddyy' ),
			'priority'    => 30,
		)
	);

	$sections = array(
		'brand_buddyy_header' => __( 'Header', 'brand-buddyy' ),
		'brand_buddyy_footer' => __( 'Footer & Contact', 'brand-buddyy' ),
		'brand_buddyy_social' => __( 'Social Links', 'brand-buddyy' ),
	);

	foreach ( $sections as $section_id => $section_title ) {
		$customizer->add_section(
			$section_id,
			array(
				'title' => $section_title,
				'panel' => 'brand_buddyy_settings',
			)
		);
	}

	$fields = array(
		'header_cta_text' => array(
			'label'   => __( 'Header CTA text', 'brand-buddyy' ),
			'section' => 'brand_buddyy_header',
			'default' => __( 'Start your project', 'brand-buddyy' ),
			'type'    => 'text',
		),
		'header_cta_url' => array(
			'label'   => __( 'Header CTA URL', 'brand-buddyy' ),
			'section' => 'brand_buddyy_header',
			'default' => brand_buddyy_front_page_url( 'contact' ),
			'type'    => 'url',
		),
		'footer_email' => array(
			'label'   => __( 'Public email address', 'brand-buddyy' ),
			'section' => 'brand_buddyy_footer',
			'default' => 'hello@brandbuddyy.com',
			'type'    => 'email',
		),
		'contact_recipient_email' => array(
			'label'   => __( 'Form recipient email', 'brand-buddyy' ),
			'section' => 'brand_buddyy_footer',
			'default' => get_option( 'admin_email' ),
			'type'    => 'email',
		),
		'footer_newsletter_title' => array(
			'label'   => __( 'Newsletter title', 'brand-buddyy' ),
			'section' => 'brand_buddyy_footer',
			'default' => __( 'Useful ideas, occasionally.', 'brand-buddyy' ),
			'type'    => 'text',
		),
		'footer_newsletter_description' => array(
			'label'   => __( 'Newsletter description', 'brand-buddyy' ),
			'section' => 'brand_buddyy_footer',
			'default' => __( 'Occasional practical insights on websites, automation, advertising and digital growth.', 'brand-buddyy' ),
			'type'    => 'textarea',
		),
		'footer_small_print' => array(
			'label'   => __( 'Footer small print', 'brand-buddyy' ),
			'section' => 'brand_buddyy_footer',
			'default' => __( 'Built with care for useful digital growth.', 'brand-buddyy' ),
			'type'    => 'text',
		),
		'social_linkedin' => array(
			'label'   => __( 'LinkedIn URL', 'brand-buddyy' ),
			'section' => 'brand_buddyy_social',
			'default' => '',
			'type'    => 'url',
		),
		'social_facebook' => array(
			'label'   => __( 'Facebook URL', 'brand-buddyy' ),
			'section' => 'brand_buddyy_social',
			'default' => '',
			'type'    => 'url',
		),
		'social_instagram' => array(
			'label'   => __( 'Instagram URL', 'brand-buddyy' ),
			'section' => 'brand_buddyy_social',
			'default' => '',
			'type'    => 'url',
		),
		'social_x' => array(
			'label'   => __( 'X / Twitter URL', 'brand-buddyy' ),
			'section' => 'brand_buddyy_social',
			'default' => '',
			'type'    => 'url',
		),
	);

	foreach ( $fields as $setting_id => $field ) {
		$sanitize_callback = 'sanitize_text_field';
		if ( 'url' === $field['type'] ) {
			$sanitize_callback = 'esc_url_raw';
		} elseif ( 'email' === $field['type'] ) {
			$sanitize_callback = 'sanitize_email';
		} elseif ( 'textarea' === $field['type'] ) {
			$sanitize_callback = 'sanitize_textarea_field';
		}

		$customizer->add_setting(
			$setting_id,
			array(
				'default'           => $field['default'],
				'sanitize_callback' => $sanitize_callback,
			)
		);
		$customizer->add_control(
			$setting_id,
			array(
				'label'   => $field['label'],
				'section' => $field['section'],
				'type'    => $field['type'],
			)
		);
	}

	$customizer->add_setting(
		'footer_background',
		array(
			'default'           => '',
			'sanitize_callback' => 'esc_url_raw',
		)
	);
	$customizer->add_control(
		new WP_Customize_Image_Control(
			$customizer,
			'footer_background',
			array(
				'label'   => __( 'Footer background image', 'brand-buddyy' ),
				'section' => 'brand_buddyy_footer',
			)
		)
	);
}
add_action( 'customize_register', 'brand_buddyy_customize_register' );

/**
 * Handle the homepage contact form.
 */
function brand_buddyy_handle_contact_form() {
	if (
		! isset( $_POST['brand_buddyy_contact_nonce'] ) ||
		! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['brand_buddyy_contact_nonce'] ) ), 'brand_buddyy_contact' )
	) {
		wp_die( esc_html__( 'The form session expired. Please go back and try again.', 'brand-buddyy' ) );
	}

	$name    = isset( $_POST['text-60'] ) ? sanitize_text_field( wp_unslash( $_POST['text-60'] ) ) : '';
	$email   = isset( $_POST['email-60'] ) ? sanitize_email( wp_unslash( $_POST['email-60'] ) ) : '';
	$message = isset( $_POST['textarea-60'] ) ? sanitize_textarea_field( wp_unslash( $_POST['textarea-60'] ) ) : '';
	$budget  = isset( $_POST['select-715'] ) ? sanitize_text_field( wp_unslash( $_POST['select-715'] ) ) : '';
	$service = isset( $_POST['select-716'] ) ? sanitize_text_field( wp_unslash( $_POST['select-716'] ) ) : '';

	if ( '' === $name || ! is_email( $email ) || '' === $message ) {
		$redirect = add_query_arg( 'contact', 'invalid', brand_buddyy_front_page_url( 'contact' ) );
		wp_safe_redirect( $redirect );
		exit;
	}

	$recipient = brand_buddyy_option( 'contact_recipient_email', get_option( 'admin_email' ) );
	$subject   = sprintf(
		/* translators: %s: Contact name. */
		__( 'New Brand Buddyy enquiry from %s', 'brand-buddyy' ),
		$name
	);
	$body      = sprintf(
		"Name: %s\nEmail: %s\nInvestment: %s\nService: %s\n\nProject details:\n%s",
		$name,
		$email,
		$budget,
		$service,
		$message
	);
	$headers   = array( 'Reply-To: ' . $name . ' <' . $email . '>' );
	$sent      = wp_mail( $recipient, $subject, $body, $headers );
	$redirect  = add_query_arg( 'contact', $sent ? 'success' : 'error', brand_buddyy_front_page_url( 'contact' ) );

	wp_safe_redirect( $redirect );
	exit;
}
add_action( 'admin_post_nopriv_brand_buddyy_contact', 'brand_buddyy_handle_contact_form' );
add_action( 'admin_post_brand_buddyy_contact', 'brand_buddyy_handle_contact_form' );

/**
 * Handle the footer newsletter form.
 */
function brand_buddyy_handle_newsletter_form() {
	if (
		! isset( $_POST['brand_buddyy_newsletter_nonce'] ) ||
		! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['brand_buddyy_newsletter_nonce'] ) ), 'brand_buddyy_newsletter' )
	) {
		wp_die( esc_html__( 'The form session expired. Please go back and try again.', 'brand-buddyy' ) );
	}

	$email = isset( $_POST['newsletter_email'] ) ? sanitize_email( wp_unslash( $_POST['newsletter_email'] ) ) : '';

	if ( ! is_email( $email ) ) {
		wp_safe_redirect( add_query_arg( 'newsletter', 'invalid', wp_get_referer() ?: home_url( '/' ) ) );
		exit;
	}

	$recipient = brand_buddyy_option( 'contact_recipient_email', get_option( 'admin_email' ) );
	$sent      = wp_mail(
		$recipient,
		__( 'New newsletter signup', 'brand-buddyy' ),
		sprintf( __( 'Please add this address to the newsletter list: %s', 'brand-buddyy' ), $email )
	);

	wp_safe_redirect( add_query_arg( 'newsletter', $sent ? 'success' : 'error', wp_get_referer() ?: home_url( '/' ) ) );
	exit;
}
add_action( 'admin_post_nopriv_brand_buddyy_newsletter', 'brand_buddyy_handle_newsletter_form' );
add_action( 'admin_post_brand_buddyy_newsletter', 'brand_buddyy_handle_newsletter_form' );

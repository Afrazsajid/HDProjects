<?php
/**
 * Theme helper functions.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Return an escaped theme asset URL.
 *
 * @param string $path Relative asset path.
 * @return string
 */
function brand_buddyy_asset( $path ) {
	return BRAND_BUDDYY_URI . '/assets/' . ltrim( $path, '/' );
}

/**
 * Get an ACF field with a fallback.
 *
 * @param string     $name     Field name.
 * @param mixed      $fallback Fallback value.
 * @param int|string $post_id  ACF post ID.
 * @return mixed
 */
function brand_buddyy_field( $name, $fallback = '', $post_id = false ) {
	if ( function_exists( 'get_field' ) ) {
		$value = get_field( $name, $post_id ?: get_queried_object_id() );
		if ( false !== $value && null !== $value && '' !== $value ) {
			return $value;
		}
	}

	return $fallback;
}

/**
 * Get a global ACF option with a fallback.
 *
 * @param string $name     Field name.
 * @param mixed  $fallback Fallback value.
 * @return mixed
 */
function brand_buddyy_option( $name, $fallback = '' ) {
	if ( function_exists( 'get_field' ) ) {
		$value = get_field( $name, 'option' );
		if ( false !== $value && null !== $value && '' !== $value ) {
			return $value;
		}
	}

	return get_theme_mod( $name, $fallback );
}

/**
 * Fixed item limits used when ACF Pro repeaters are unavailable.
 *
 * @return array
 */
function brand_buddyy_free_acf_repeater_limits() {
	return array(
		'about_features'    => 3,
		'capabilities'      => 4,
		'benefits'          => 3,
		'partner_logos'     => 6,
		'services'          => 4,
		'portfolio_items'   => 4,
		'testimonials'      => 4,
		'engagements'       => 3,
		'process_steps'     => 3,
		'faqs'              => 15,
		'content_overrides' => 8,
	);
}

/**
 * Read either a real ACF repeater or its free-ACF fixed-field equivalent.
 *
 * @param string $field_name     Repeater field name.
 * @param int    $page_id        Page ID.
 * @param array  $subfield_names Expected row field names.
 * @return array
 */
function brand_buddyy_repeater_rows( $field_name, $page_id, $subfield_names ) {
	$rows = brand_buddyy_field( $field_name, array(), $page_id );
	if ( is_array( $rows ) && ! empty( $rows ) ) {
		return $rows;
	}

	$limits = brand_buddyy_free_acf_repeater_limits();
	$limit  = isset( $limits[ $field_name ] ) ? (int) $limits[ $field_name ] : 0;
	$rows   = array();

	for ( $index = 1; $index <= $limit; $index++ ) {
		$row      = array();
		$has_data = false;

		foreach ( $subfield_names as $subfield_name ) {
			$value                 = brand_buddyy_field( $field_name . '_' . $index . '_' . $subfield_name, '', $page_id );
			$row[ $subfield_name ] = $value;
			if ( false !== $value && null !== $value && '' !== $value && array() !== $value ) {
				$has_data = true;
			}
		}

		if ( $has_data ) {
			$rows[] = $row;
		}
	}

	return $rows;
}

/**
 * Normalize an ACF image value into a URL.
 *
 * @param mixed  $image    Image array, ID, or URL.
 * @param string $size     WordPress image size.
 * @param string $fallback Fallback URL.
 * @return string
 */
function brand_buddyy_image_url( $image, $size = 'full', $fallback = '' ) {
	if ( is_array( $image ) && ! empty( $image['ID'] ) ) {
		$url = wp_get_attachment_image_url( (int) $image['ID'], $size );
		return $url ?: $fallback;
	}

	if ( is_numeric( $image ) ) {
		$url = wp_get_attachment_image_url( (int) $image, $size );
		return $url ?: $fallback;
	}

	if ( is_string( $image ) && filter_var( $image, FILTER_VALIDATE_URL ) ) {
		return $image;
	}

	return $fallback;
}

/**
 * Return the homepage URL with an optional anchor.
 *
 * @param string $anchor Anchor without #.
 * @return string
 */
function brand_buddyy_front_page_url( $anchor = '' ) {
	$url = home_url( '/' );
	return $anchor ? $url . '#' . sanitize_title( $anchor ) : $url;
}

/**
 * Default one-page menu used before a WordPress menu is assigned.
 *
 * @return void
 */
function brand_buddyy_default_menu() {
	$items = array(
		'about'    => __( 'About', 'brand-buddyy' ),
		'services' => __( 'Services', 'brand-buddyy' ),
		'work'     => __( 'Solutions', 'brand-buddyy' ),
		'process'  => __( 'Process', 'brand-buddyy' ),
		'faq'      => __( 'FAQs', 'brand-buddyy' ),
		'contact'  => __( 'Contact', 'brand-buddyy' ),
	);

	echo '<ul class="menu nav navbar-nav clearfix list-unstyled">';
	foreach ( $items as $anchor => $label ) {
		printf(
			'<li class="menu-item"><a href="%1$s">%2$s</a></li>',
			esc_url( brand_buddyy_front_page_url( $anchor ) ),
			esc_html( $label )
		);
	}
	echo '</ul>';
}

/**
 * Render the textual logo fallback.
 *
 * @return void
 */
function brand_buddyy_logo() {
	if ( has_custom_logo() ) {
		the_custom_logo();
		return;
	}

	printf(
		'<span class="bb-site-logo"><span>%1$s</span><strong>%2$s</strong></span>',
		esc_html__( 'brand', 'brand-buddyy' ),
		esc_html__( 'buddyy.', 'brand-buddyy' )
	);
}

/**
 * Render a preserved static homepage section.
 *
 * The source fragment keeps the exact original class names and animation hooks.
 * WordPress/ACF content is applied after render by assets/js/home-content.js.
 *
 * @param string $name Section filename without extension.
 * @param string $id   Optional section ID.
 * @return void
 */
function brand_buddyy_render_home_section( $name, $id = '' ) {
	$file = BRAND_BUDDYY_PATH . '/assets/source/sections/' . sanitize_file_name( $name ) . '.html';

	if ( ! is_readable( $file ) ) {
		return;
	}

	$html       = file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	$vendor_uri = brand_buddyy_asset( 'vendor/wp/avista/' );
	$images_uri = brand_buddyy_asset( 'images/' );

	$html = str_replace( 'wp/avista/', esc_url( $vendor_uri ), $html );
	$html = preg_replace_callback(
		'#https://themexriver\.com/wp/avista/wp-content/uploads/2025/(?:10|11)/([^"\'&\s)]+)#',
		static function ( $matches ) use ( $images_uri ) {
			$filename   = rawurldecode( basename( $matches[1] ) );
			$candidates = array(
				$filename,
				str_replace( '-', '_', $filename ),
			);

			foreach ( $candidates as $candidate ) {
				if ( is_readable( BRAND_BUDDYY_PATH . '/assets/images/' . $candidate ) ) {
					return esc_url( $images_uri . rawurlencode( $candidate ) );
				}
			}

			return $matches[0];
		},
		$html
	);
	$html = preg_replace(
		'#href=(["\'])https://themexriver\.com/wp/avista(?:/[^"\']*)?\1#',
		'href="' . esc_url( brand_buddyy_front_page_url( 'contact' ) ) . '"',
		$html
	);

	if ( $id ) {
		$html = preg_replace( '/<section\b/', '<section id="' . esc_attr( $id ) . '"', $html, 1 );
	}

	printf(
		'<div class="bb-home-section bb-home-section--%1$s">%2$s</div>',
		esc_attr( sanitize_html_class( $name ) ),
		$html // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Audited local theme fragment.
	);
}

/**
 * Convert ACF link data to a normalized array.
 *
 * @param mixed  $link     ACF link field.
 * @param string $fallback Fallback URL.
 * @return array
 */
function brand_buddyy_link_data( $link, $fallback = '' ) {
	if ( is_array( $link ) ) {
		return array(
			'url'    => isset( $link['url'] ) ? esc_url_raw( $link['url'] ) : $fallback,
			'title'  => isset( $link['title'] ) ? sanitize_text_field( $link['title'] ) : '',
			'target' => isset( $link['target'] ) ? sanitize_key( $link['target'] ) : '',
		);
	}

	return array(
		'url'    => $fallback,
		'title'  => '',
		'target' => '',
	);
}

/**
 * Create frontend content operations from ACF values.
 *
 * @return array
 */
function brand_buddyy_home_content_data() {
	$page_id = (int) get_option( 'page_on_front' );

	return array(
		'ajaxUrl'      => esc_url_raw( admin_url( 'admin-post.php' ) ),
		'contactNonce' => wp_create_nonce( 'brand_buddyy_contact' ),
		'operations'   => brand_buddyy_home_operations( $page_id ?: get_queried_object_id() ),
		'repeaters'    => brand_buddyy_home_repeaters( $page_id ?: get_queried_object_id() ),
	);
}

/**
 * Build single-element content operations.
 *
 * @param int $page_id Homepage ID.
 * @return array
 */
function brand_buddyy_home_operations( $page_id ) {
	$map = array(
		array( '.as-hero-1-area .hero-disc', 'text', 'hero_intro' ),
		array( '.as-hero-1-area .hero-title', 'text', 'hero_title' ),
		array( '.as-hero-1-area .box-title', 'text', 'hero_card_title' ),
		array( '.as-hero-1-area .tx-button .text', 'text', 'hero_button_text' ),
		array( '.as-hero-1-area .tx-button', 'href', 'hero_button_url' ),
		array( '.as-hero-1-area .guaranteed', 'text', 'hero_guarantee' ),
		array( '.as-about-1-area .tx-subTitle', 'text', 'about_eyebrow' ),
		array( '.as-about-1-area .tx-title', 'text', 'about_title' ),
		array( '.as-about-1-area .sec-disc', 'html', 'about_description' ),
		array( '.as-team-1-area .tx-subTitle', 'text', 'capabilities_eyebrow' ),
		array( '.as-team-1-area .tx-title', 'text', 'capabilities_title' ),
		array( '.as-features-1-area .tx-subTitle', 'text', 'benefits_eyebrow' ),
		array( '.as-features-1-area .tx-title', 'text', 'benefits_title' ),
		array( '.as-partner-1-area .tx-subTitle', 'text', 'partners_eyebrow' ),
		array( '.as-partner-1-area .tx-title', 'text', 'partners_title' ),
		array( '.as-services-1-area .tx-subTitle', 'text', 'services_eyebrow' ),
		array( '.as-services-1-area .tx-title', 'text', 'services_title' ),
		array( '.as-services-1-area .tx-description', 'text', 'services_description' ),
		array( '.as-portfolio-1-area .tx-subTitle', 'text', 'portfolio_eyebrow' ),
		array( '.as-portfolio-1-area .tx-title', 'text', 'portfolio_title' ),
		array( '.as-portfolio-1-area .as-portfolio-1-content-disc', 'text', 'portfolio_description' ),
		array( '.as-cta-1-area .as-cta-1-content', 'ctaTitle', 'primary_cta_title' ),
		array( '.as-cta-1-area .as-cta-1-content .as-pr-btn-1 .text', 'textAll', 'primary_cta_button_text' ),
		array( '.as-cta-1-area .as-cta-1-content .as-pr-btn-1', 'hrefAll', 'primary_cta_button_url' ),
		array( '.as-testimonial-1-area .tx-subTitle', 'text', 'testimonials_eyebrow' ),
		array( '.as-testimonial-1-area .tx-title', 'text', 'testimonials_title' ),
		array( '.as-price-1-area .tx-subTitle', 'text', 'engagements_eyebrow' ),
		array( '.as-price-1-area .tx-title', 'text', 'engagements_title' ),
		array( '.as-price-1-area .sec-disc', 'text', 'engagements_description' ),
		array( '.as-process-1-area .as-process-1-sec-title .tx-title', 'text', 'process_title' ),
		array( '.as-faqs-1-area .as-faqs-1-left-sec-title .tx-title', 'text', 'faq_left_title' ),
		array( '.as-faqs-1-area .as-faqs-1-right-sec-title .tx-title', 'text', 'faq_title' ),
		array( '.as-cta-2-area .as-cta-2-booking .title', 'text', 'contact_title' ),
		array( '.as-cta-2-area .as-cta-2-booking .disc', 'text', 'contact_description' ),
		array( '.as-cta-2-area .as-cta-2-form-content .title', 'text', 'contact_form_title' ),
		array( '.as-marquee-text-1-area .text-elm', 'textAll', 'marquee_text' ),
	);

	$operations = array();
	foreach ( $map as $item ) {
		$value = brand_buddyy_field( $item[2], '', $page_id );
		if ( '' !== $value && false !== $value && null !== $value ) {
			$operations[] = array(
				'selector' => $item[0],
				'type'     => $item[1],
				'value'    => is_string( $value ) ? wp_kses_post( $value ) : $value,
			);
		}
	}

	$image_map = array(
		array( '.as-hero-1-area .as-hero-1-img img', 'hero_image' ),
		array( '.as-about-1-area .as-about-1-right img', 'about_image' ),
		array( '.as-faqs-1-area .bg-shape-1', 'faq_image_one' ),
		array( '.as-faqs-1-area .bg-shape-2', 'faq_image_two' ),
		array( '.as-cta-2-area .as-cta-2-manager img', 'contact_manager_image' ),
		array( '.as-cta-2-area .as-cta-2-projects-ss > img', 'contact_mockup_image' ),
		array( '.as-cta-1-area .as-cta-1-img-1 img', 'primary_cta_image_one' ),
		array( '.as-cta-1-area .as-cta-1-img-2 img', 'primary_cta_image_two' ),
	);

	foreach ( $image_map as $item ) {
		$image = brand_buddyy_field( $item[1], '', $page_id );
		$url   = brand_buddyy_image_url( $image );
		if ( $url ) {
			$operations[] = array(
				'selector' => $item[0],
				'type'     => 'src',
				'value'    => esc_url_raw( $url ),
			);
		}
	}

	$overrides = brand_buddyy_repeater_rows(
		'content_overrides',
		$page_id,
		array( 'selector', 'type', 'value', 'image' )
	);
	if ( is_array( $overrides ) ) {
		foreach ( $overrides as $override ) {
			$selector = isset( $override['selector'] ) ? sanitize_text_field( $override['selector'] ) : '';
			$type     = isset( $override['type'] ) ? sanitize_key( $override['type'] ) : 'text';
			$value    = isset( $override['value'] ) ? $override['value'] : '';

			if ( 'src' === $type && ! empty( $override['image'] ) ) {
				$value = brand_buddyy_image_url( $override['image'] );
			}

			if ( $selector && $value ) {
				$operations[] = array(
					'selector' => $selector,
					'type'     => $type,
					'value'    => 'html' === $type ? wp_kses_post( $value ) : sanitize_text_field( $value ),
				);
			}
		}
	}

	return $operations;
}

/**
 * Build repeatable section content for the frontend adapter.
 *
 * @param int $page_id Homepage ID.
 * @return array
 */
function brand_buddyy_home_repeaters( $page_id ) {
	$definitions = array(
		'about_features' => array(
			'root'   => '.as-about-1-area',
			'item'   => '.as-about-1-features-single',
			'fields' => array(
				'title'       => array( '.item-title a', 'text' ),
				'description' => array( '.item-disc', 'text' ),
			),
		),
		'capabilities' => array(
			'root'   => '.as-team-1-area',
			'item'   => '.as-team-1-member',
			'fields' => array(
				'title'       => array( '.name', 'text' ),
				'description' => array( '.dg', 'text' ),
				'image'       => array( 'img', 'src' ),
				'link'        => array( 'a', 'href' ),
			),
		),
		'benefits' => array(
			'root'   => '.as-features-1-area',
			'item'   => '.as-features-1-creative, .as-features-1-quality, .as-features-1-result',
			'fields' => array(
				'title'       => array( '.title', 'text' ),
				'description' => array( '.disc', 'text' ),
			),
		),
		'partner_logos' => array(
			'root'   => '.as-partner-1-area',
			'item'   => '.as-partner-1-logo-single',
			'fields' => array(
				'image' => array( 'img', 'src' ),
				'link'  => array( 'a', 'hrefAll' ),
			),
		),
		'services' => array(
			'root'   => '.as-services-1-area',
			'item'   => '.as-services-1-item',
			'fields' => array(
				'title' => array( '.title a', 'textAll' ),
				'image' => array( 'img', 'src' ),
				'link'  => array( 'a', 'hrefAll' ),
				'tags'  => array( '.item-tags li', 'textList' ),
			),
		),
		'portfolio_items' => array(
			'root'   => '.as-portfolio-1-area',
			'item'   => '.as-portfolio-1-item',
			'fields' => array(
				'title'       => array( '.content-wrap .title a', 'text' ),
				'description' => array( '.content-wrap .disc', 'text' ),
				'image'       => array( 'img', 'src' ),
				'link'        => array( 'a', 'hrefAll' ),
				'tags'        => array( '.item-tags a', 'textList' ),
			),
		),
		'testimonials' => array(
			'root'   => '.as-testimonial-1-area',
			'item'   => '.as-testimonial-1-item',
			'fields' => array(
				'title'       => array( '.title', 'text' ),
				'quote'       => array( '.comment', 'text' ),
				'name'        => array( '.name', 'text' ),
				'role'        => array( '.dg', 'text' ),
				'image'       => array( '.item-author-img img', 'src' ),
				'logo'        => array( '.author-logo img', 'src' ),
			),
		),
		'engagements' => array(
			'root'   => '.as-price-1-area',
			'item'   => '.as-price-1-card',
			'fields' => array(
				'name'        => array( '.plan-name', 'text' ),
				'description' => array( '.plan-disc', 'text' ),
				'price'       => array( '.plan-price', 'text' ),
				'features'    => array( '.plan-list li', 'textList' ),
				'button_text' => array( '.plan-btn .text', 'text' ),
				'button_url'  => array( '.plan-btn', 'href' ),
			),
		),
		'process_steps' => array(
			'root'   => '.as-process-1-area',
			'item'   => '.as-process-1-card',
			'fields' => array(
				'title'       => array( '.title', 'text' ),
				'description' => array( '.disc', 'text' ),
				'image'       => array( 'img', 'src' ),
			),
		),
		'faqs' => array(
			'root'   => '.as-faqs-1-area',
			'item'   => '.as-accordion-item',
			'fields' => array(
				'question' => array( '.item-title', 'faqTitle' ),
				'answer'   => array( '.item-disc', 'html' ),
			),
		),
	);

	$output = array();
	foreach ( $definitions as $field_name => $definition ) {
		$rows = brand_buddyy_repeater_rows( $field_name, $page_id, array_keys( $definition['fields'] ) );
		if ( ! is_array( $rows ) || empty( $rows ) ) {
			continue;
		}

		foreach ( $rows as &$row ) {
			foreach ( $row as $key => $value ) {
				if ( is_array( $value ) && isset( $value['ID'] ) ) {
					$row[ $key ] = brand_buddyy_image_url( $value );
				} elseif ( is_array( $value ) && isset( $value['url'] ) ) {
					$row[ $key ] = esc_url_raw( $value['url'] );
				}
			}
		}
		unset( $row );

		$output[] = array(
			'root'   => $definition['root'],
			'item'   => $definition['item'],
			'fields' => $definition['fields'],
			'rows'   => $rows,
		);
	}

	return $output;
}

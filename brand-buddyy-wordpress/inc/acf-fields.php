<?php
/**
 * Local ACF field groups.
 *
 * Requires Advanced Custom Fields Pro for repeaters and the options page.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Create a common ACF field definition.
 *
 * @param string $key   Unique key suffix.
 * @param string $label Admin label.
 * @param string $name  Field name.
 * @param string $type  ACF field type.
 * @param array  $extra Additional settings.
 * @return array
 */
function brand_buddyy_acf_field( $key, $label, $name, $type = 'text', $extra = array() ) {
	return array_merge(
		array(
			'key'   => 'field_bb_' . $key,
			'label' => $label,
			'name'  => $name,
			'type'  => $type,
		),
		$extra
	);
}

/**
 * Create an ACF tab.
 *
 * @param string $key   Unique key suffix.
 * @param string $label Tab label.
 * @return array
 */
function brand_buddyy_acf_tab( $key, $label ) {
	return brand_buddyy_acf_field(
		'tab_' . $key,
		$label,
		'',
		'tab',
		array(
			'placement' => 'top',
		)
	);
}

/**
 * Create an image field.
 *
 * @param string $key   Unique key suffix.
 * @param string $label Admin label.
 * @param string $name  Field name.
 * @return array
 */
function brand_buddyy_acf_image( $key, $label, $name ) {
	return brand_buddyy_acf_field(
		$key,
		$label,
		$name,
		'image',
		array(
			'return_format' => 'array',
			'preview_size'  => 'medium',
			'library'       => 'all',
		)
	);
}

/**
 * Create a URL field.
 *
 * @param string $key   Unique key suffix.
 * @param string $label Admin label.
 * @param string $name  Field name.
 * @return array
 */
function brand_buddyy_acf_url( $key, $label, $name ) {
	return brand_buddyy_acf_field( $key, $label, $name, 'url' );
}

/**
 * Convert Pro repeater definitions into ordinary fixed fields for free ACF.
 *
 * The visual design has a known number of cards, so fixed panels provide a
 * simpler editor while preserving every editable value and image.
 *
 * @param array $fields Field definitions.
 * @return array
 */
function brand_buddyy_expand_repeaters_for_free_acf( $fields ) {
	$expanded = array();
	$limits   = brand_buddyy_free_acf_repeater_limits();

	foreach ( $fields as $field ) {
		if ( 'repeater' !== $field['type'] ) {
			$expanded[] = $field;
			continue;
		}

		$parent_name = $field['name'];
		$limit       = isset( $limits[ $parent_name ] ) ? (int) $limits[ $parent_name ] : (int) ( $field['max'] ?? 0 );
		$limit       = $limit > 0 ? $limit : 8;
		$subfields   = isset( $field['sub_fields'] ) && is_array( $field['sub_fields'] ) ? $field['sub_fields'] : array();

		$expanded[] = brand_buddyy_acf_field(
			'free_' . $parent_name . '_intro',
			$field['label'],
			'',
			'message',
			array(
				'message' => sprintf(
					/* translators: %d: Number of editable items. */
					__( 'Edit the %d items below. Leave an optional item empty if you do not want to change its existing design content.', 'brand-buddyy' ),
					$limit
				),
			)
		);

		for ( $index = 1; $index <= $limit; $index++ ) {
			$expanded[] = brand_buddyy_acf_field(
				'free_' . $parent_name . '_' . $index . '_heading',
				sprintf(
					/* translators: 1: Section label, 2: Item number. */
					__( '%1$s — Item %2$d', 'brand-buddyy' ),
					$field['label'],
					$index
				),
				'',
				'message',
				array(
					'message' => '<hr>',
					'wrapper' => array( 'class' => 'bb-acf-item-heading' ),
				)
			);

			foreach ( $subfields as $subfield ) {
				$subfield_name          = $subfield['name'];
				$subfield['key']        = 'field_bb_free_' . sanitize_key( $parent_name . '_' . $index . '_' . $subfield_name );
				$subfield['name']       = $parent_name . '_' . $index . '_' . $subfield_name;
				$subfield['label']      = sprintf(
					/* translators: 1: Field label, 2: Item number. */
					__( '%1$s %2$d', 'brand-buddyy' ),
					$subfield['label'],
					$index
				);
				$subfield['parent']     = '';
				$subfield['conditions'] = array();
				$expanded[]             = $subfield;
			}
		}
	}

	return $expanded;
}

/**
 * Register the global and homepage field groups.
 */
function brand_buddyy_register_acf_fields() {
	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}

	acf_add_local_field_group(
		array(
			'key'                   => 'group_brand_buddyy_global',
			'title'                 => __( 'Brand Buddyy — Global Theme Settings', 'brand-buddyy' ),
			'fields'                => array(
				brand_buddyy_acf_tab( 'global_header', __( 'Header', 'brand-buddyy' ) ),
				brand_buddyy_acf_field( 'header_cta_text', __( 'Header CTA text', 'brand-buddyy' ), 'header_cta_text' ),
				brand_buddyy_acf_url( 'header_cta_url', __( 'Header CTA URL', 'brand-buddyy' ), 'header_cta_url' ),

				brand_buddyy_acf_tab( 'global_footer', __( 'Footer', 'brand-buddyy' ) ),
				brand_buddyy_acf_field( 'footer_email', __( 'Public email address', 'brand-buddyy' ), 'footer_email', 'email' ),
				brand_buddyy_acf_field( 'recipient_email', __( 'Form recipient email', 'brand-buddyy' ), 'contact_recipient_email', 'email' ),
				brand_buddyy_acf_field( 'footer_newsletter_title', __( 'Newsletter title', 'brand-buddyy' ), 'footer_newsletter_title' ),
				brand_buddyy_acf_field( 'footer_newsletter_description', __( 'Newsletter description', 'brand-buddyy' ), 'footer_newsletter_description', 'textarea', array( 'rows' => 3 ) ),
				brand_buddyy_acf_image( 'footer_background', __( 'Footer background image', 'brand-buddyy' ), 'footer_background' ),
				brand_buddyy_acf_field( 'footer_small_print', __( 'Footer small print', 'brand-buddyy' ), 'footer_small_print' ),

				brand_buddyy_acf_tab( 'global_social', __( 'Social Links', 'brand-buddyy' ) ),
				brand_buddyy_acf_url( 'social_linkedin', __( 'LinkedIn URL', 'brand-buddyy' ), 'social_linkedin' ),
				brand_buddyy_acf_url( 'social_facebook', __( 'Facebook URL', 'brand-buddyy' ), 'social_facebook' ),
				brand_buddyy_acf_url( 'social_instagram', __( 'Instagram URL', 'brand-buddyy' ), 'social_instagram' ),
				brand_buddyy_acf_url( 'social_x', __( 'X / Twitter URL', 'brand-buddyy' ), 'social_x' ),
			),
			'location'              => array(
				array(
					array(
						'param'    => 'options_page',
						'operator' => '==',
						'value'    => 'brand-buddyy-settings',
					),
				),
			),
			'menu_order'            => 0,
			'position'              => 'normal',
			'style'                 => 'default',
			'label_placement'       => 'top',
			'instruction_placement' => 'label',
			'active'                => true,
		)
	);

	$fields = array(
		brand_buddyy_acf_tab( 'hero', __( '1. Hero', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'hero_intro', __( 'Intro text', 'brand-buddyy' ), 'hero_intro', 'textarea', array( 'rows' => 3 ) ),
		brand_buddyy_acf_field( 'hero_title', __( 'Main heading', 'brand-buddyy' ), 'hero_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'hero_card_title', __( 'Strategy card heading', 'brand-buddyy' ), 'hero_card_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'hero_button_text', __( 'Button text', 'brand-buddyy' ), 'hero_button_text' ),
		brand_buddyy_acf_url( 'hero_button_url', __( 'Button URL', 'brand-buddyy' ), 'hero_button_url' ),
		brand_buddyy_acf_field( 'hero_guarantee', __( 'Supporting label', 'brand-buddyy' ), 'hero_guarantee' ),
		brand_buddyy_acf_image( 'hero_image', __( 'Hero image', 'brand-buddyy' ), 'hero_image' ),

		brand_buddyy_acf_tab( 'about', __( '2. About', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'about_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'about_eyebrow' ),
		brand_buddyy_acf_field( 'about_title', __( 'Heading', 'brand-buddyy' ), 'about_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'about_description', __( 'Description', 'brand-buddyy' ), 'about_description', 'wysiwyg', array( 'tabs' => 'visual', 'toolbar' => 'basic', 'media_upload' => false ) ),
		brand_buddyy_acf_image( 'about_image', __( 'Section image', 'brand-buddyy' ), 'about_image' ),
		brand_buddyy_acf_field(
			'about_features',
			__( 'About feature cards', 'brand-buddyy' ),
			'about_features',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add feature', 'brand-buddyy' ),
				'max'          => 3,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'about_feature_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'about_feature_description', __( 'Description', 'brand-buddyy' ), 'description', 'textarea', array( 'rows' => 3 ) ),
				),
			)
		),

		brand_buddyy_acf_tab( 'capabilities', __( '3. Capabilities', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'capabilities_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'capabilities_eyebrow' ),
		brand_buddyy_acf_field( 'capabilities_title', __( 'Heading', 'brand-buddyy' ), 'capabilities_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field(
			'capabilities',
			__( 'Capability cards', 'brand-buddyy' ),
			'capabilities',
			'repeater',
			array(
				'layout'       => 'row',
				'button_label' => __( 'Add capability', 'brand-buddyy' ),
				'max'          => 4,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'capability_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'capability_description', __( 'Description', 'brand-buddyy' ), 'description', 'textarea', array( 'rows' => 2 ) ),
					brand_buddyy_acf_image( 'capability_image', __( 'Image', 'brand-buddyy' ), 'image' ),
					brand_buddyy_acf_url( 'capability_link', __( 'Link', 'brand-buddyy' ), 'link' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'marquee', __( '4. Marquee & Benefits', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'marquee_text', __( 'Marquee text', 'brand-buddyy' ), 'marquee_text', 'textarea', array( 'rows' => 3, 'instructions' => __( 'This text repeats across the scrolling band.', 'brand-buddyy' ) ) ),
		brand_buddyy_acf_field( 'benefits_eyebrow', __( 'Benefits eyebrow', 'brand-buddyy' ), 'benefits_eyebrow' ),
		brand_buddyy_acf_field( 'benefits_title', __( 'Benefits heading', 'brand-buddyy' ), 'benefits_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field(
			'benefits',
			__( 'Benefit cards', 'brand-buddyy' ),
			'benefits',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add benefit', 'brand-buddyy' ),
				'max'          => 3,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'benefit_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'benefit_description', __( 'Description', 'brand-buddyy' ), 'description', 'textarea', array( 'rows' => 3 ) ),
				),
			)
		),

		brand_buddyy_acf_tab( 'partners', __( '5. Partner Composition', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'partners_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'partners_eyebrow' ),
		brand_buddyy_acf_field( 'partners_title', __( 'Heading', 'brand-buddyy' ), 'partners_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field(
			'partner_logos',
			__( 'Logos', 'brand-buddyy' ),
			'partner_logos',
			'repeater',
			array(
				'layout'       => 'table',
				'button_label' => __( 'Add logo', 'brand-buddyy' ),
				'max'          => 6,
				'sub_fields'   => array(
					brand_buddyy_acf_image( 'partner_logo', __( 'Logo', 'brand-buddyy' ), 'image' ),
					brand_buddyy_acf_url( 'partner_logo_link', __( 'Link', 'brand-buddyy' ), 'link' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'services', __( '6. Services', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'services_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'services_eyebrow' ),
		brand_buddyy_acf_field( 'services_title', __( 'Heading', 'brand-buddyy' ), 'services_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'services_description', __( 'Description', 'brand-buddyy' ), 'services_description', 'textarea', array( 'rows' => 3 ) ),
		brand_buddyy_acf_field(
			'services',
			__( 'Service cards', 'brand-buddyy' ),
			'services',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add service', 'brand-buddyy' ),
				'max'          => 4,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'service_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'service_tags', __( 'Tags', 'brand-buddyy' ), 'tags', 'textarea', array( 'rows' => 4, 'instructions' => __( 'One tag per line.', 'brand-buddyy' ) ) ),
					brand_buddyy_acf_image( 'service_image', __( 'Image', 'brand-buddyy' ), 'image' ),
					brand_buddyy_acf_url( 'service_link', __( 'Link', 'brand-buddyy' ), 'link' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'portfolio', __( '7. Solutions / Work', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'portfolio_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'portfolio_eyebrow' ),
		brand_buddyy_acf_field( 'portfolio_title', __( 'Heading', 'brand-buddyy' ), 'portfolio_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'portfolio_description', __( 'Closing description', 'brand-buddyy' ), 'portfolio_description', 'textarea', array( 'rows' => 3 ) ),
		brand_buddyy_acf_field(
			'portfolio_items',
			__( 'Solution cards', 'brand-buddyy' ),
			'portfolio_items',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add solution', 'brand-buddyy' ),
				'max'          => 4,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'portfolio_item_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'portfolio_item_description', __( 'Description', 'brand-buddyy' ), 'description', 'textarea', array( 'rows' => 3 ) ),
					brand_buddyy_acf_field( 'portfolio_item_tags', __( 'Tags', 'brand-buddyy' ), 'tags', 'textarea', array( 'rows' => 2, 'instructions' => __( 'One tag per line.', 'brand-buddyy' ) ) ),
					brand_buddyy_acf_image( 'portfolio_item_image', __( 'Image', 'brand-buddyy' ), 'image' ),
					brand_buddyy_acf_url( 'portfolio_item_link', __( 'Link', 'brand-buddyy' ), 'link' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'primary_cta', __( '8. Primary CTA', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'primary_cta_title', __( 'Heading', 'brand-buddyy' ), 'primary_cta_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'primary_cta_description', __( 'Description', 'brand-buddyy' ), 'primary_cta_description', 'textarea', array( 'rows' => 3 ) ),
		brand_buddyy_acf_field( 'primary_cta_button_text', __( 'Button text', 'brand-buddyy' ), 'primary_cta_button_text' ),
		brand_buddyy_acf_url( 'primary_cta_button_url', __( 'Button URL', 'brand-buddyy' ), 'primary_cta_button_url' ),
		brand_buddyy_acf_image( 'primary_cta_image_one', __( 'Image one', 'brand-buddyy' ), 'primary_cta_image_one' ),
		brand_buddyy_acf_image( 'primary_cta_image_two', __( 'Image two', 'brand-buddyy' ), 'primary_cta_image_two' ),

		brand_buddyy_acf_tab( 'testimonials', __( '9. Principles / Testimonials', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'testimonials_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'testimonials_eyebrow' ),
		brand_buddyy_acf_field( 'testimonials_title', __( 'Heading', 'brand-buddyy' ), 'testimonials_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field(
			'testimonials',
			__( 'Testimonial cards', 'brand-buddyy' ),
			'testimonials',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add testimonial', 'brand-buddyy' ),
				'max'          => 4,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'testimonial_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'testimonial_quote', __( 'Quote', 'brand-buddyy' ), 'quote', 'textarea', array( 'rows' => 4 ) ),
					brand_buddyy_acf_field( 'testimonial_name', __( 'Name', 'brand-buddyy' ), 'name' ),
					brand_buddyy_acf_field( 'testimonial_role', __( 'Role / label', 'brand-buddyy' ), 'role' ),
					brand_buddyy_acf_image( 'testimonial_image', __( 'Portrait', 'brand-buddyy' ), 'image' ),
					brand_buddyy_acf_image( 'testimonial_logo', __( 'Logo', 'brand-buddyy' ), 'logo' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'engagements', __( '10. Engagement Models', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'engagements_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'engagements_eyebrow' ),
		brand_buddyy_acf_field( 'engagements_title', __( 'Heading', 'brand-buddyy' ), 'engagements_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'engagements_description', __( 'Description', 'brand-buddyy' ), 'engagements_description', 'textarea', array( 'rows' => 3 ) ),
		brand_buddyy_acf_field(
			'engagements',
			__( 'Engagement cards', 'brand-buddyy' ),
			'engagements',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add engagement model', 'brand-buddyy' ),
				'max'          => 3,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'engagement_name', __( 'Name', 'brand-buddyy' ), 'name' ),
					brand_buddyy_acf_field( 'engagement_description', __( 'Description', 'brand-buddyy' ), 'description', 'textarea', array( 'rows' => 3 ) ),
					brand_buddyy_acf_field( 'engagement_price', __( 'Price / label', 'brand-buddyy' ), 'price' ),
					brand_buddyy_acf_field( 'engagement_features', __( 'Features', 'brand-buddyy' ), 'features', 'textarea', array( 'rows' => 6, 'instructions' => __( 'One feature per line.', 'brand-buddyy' ) ) ),
					brand_buddyy_acf_field( 'engagement_button_text', __( 'Button text', 'brand-buddyy' ), 'button_text' ),
					brand_buddyy_acf_url( 'engagement_button_url', __( 'Button URL', 'brand-buddyy' ), 'button_url' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'process', __( '11. Process', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'process_title', __( 'Heading', 'brand-buddyy' ), 'process_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field(
			'process_steps',
			__( 'Process cards', 'brand-buddyy' ),
			'process_steps',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add process step', 'brand-buddyy' ),
				'max'          => 3,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'process_step_title', __( 'Title', 'brand-buddyy' ), 'title' ),
					brand_buddyy_acf_field( 'process_step_description', __( 'Description', 'brand-buddyy' ), 'description', 'textarea', array( 'rows' => 3 ) ),
					brand_buddyy_acf_image( 'process_step_image', __( 'Image', 'brand-buddyy' ), 'image' ),
				),
			)
		),

		brand_buddyy_acf_tab( 'faqs', __( '12. FAQs', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'faq_left_title', __( 'Left heading', 'brand-buddyy' ), 'faq_left_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'faq_title', __( 'FAQ heading', 'brand-buddyy' ), 'faq_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_image( 'faq_image_one', __( 'Illustration one', 'brand-buddyy' ), 'faq_image_one' ),
		brand_buddyy_acf_image( 'faq_image_two', __( 'Illustration two', 'brand-buddyy' ), 'faq_image_two' ),
		brand_buddyy_acf_field(
			'faqs',
			__( 'Questions and answers', 'brand-buddyy' ),
			'faqs',
			'repeater',
			array(
				'layout'       => 'block',
				'button_label' => __( 'Add FAQ', 'brand-buddyy' ),
				'max'          => 15,
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'faq_question', __( 'Question', 'brand-buddyy' ), 'question' ),
					brand_buddyy_acf_field( 'faq_answer', __( 'Answer', 'brand-buddyy' ), 'answer', 'wysiwyg', array( 'tabs' => 'visual', 'toolbar' => 'basic', 'media_upload' => false ) ),
				),
			)
		),

		brand_buddyy_acf_tab( 'contact', __( '13. Contact', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'contact_title', __( 'Heading', 'brand-buddyy' ), 'contact_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'contact_description', __( 'Description', 'brand-buddyy' ), 'contact_description', 'textarea', array( 'rows' => 3 ) ),
		brand_buddyy_acf_field( 'contact_form_title', __( 'Form heading', 'brand-buddyy' ), 'contact_form_title' ),
		brand_buddyy_acf_image( 'contact_manager_image', __( 'Manager image', 'brand-buddyy' ), 'contact_manager_image' ),
		brand_buddyy_acf_image( 'contact_mockup_image', __( 'Project mockup image', 'brand-buddyy' ), 'contact_mockup_image' ),

		brand_buddyy_acf_tab( 'insights', __( '14. Insights', 'brand-buddyy' ) ),
		brand_buddyy_acf_field( 'insights_eyebrow', __( 'Eyebrow', 'brand-buddyy' ), 'insights_eyebrow' ),
		brand_buddyy_acf_field( 'insights_title', __( 'Heading', 'brand-buddyy' ), 'insights_title', 'textarea', array( 'rows' => 2 ) ),
		brand_buddyy_acf_field( 'insights_description', __( 'Description', 'brand-buddyy' ), 'insights_description', 'textarea', array( 'rows' => 3 ) ),

		brand_buddyy_acf_tab( 'advanced', __( 'Advanced Overrides', 'brand-buddyy' ) ),
		brand_buddyy_acf_field(
			'content_overrides',
			__( 'Additional element overrides', 'brand-buddyy' ),
			'content_overrides',
			'repeater',
			array(
				'instructions' => __( 'For developer use when an individual decorative image, text label, or URL is not covered above.', 'brand-buddyy' ),
				'layout'       => 'block',
				'button_label' => __( 'Add override', 'brand-buddyy' ),
				'sub_fields'   => array(
					brand_buddyy_acf_field( 'override_selector', __( 'CSS selector', 'brand-buddyy' ), 'selector' ),
					brand_buddyy_acf_field(
						'override_type',
						__( 'Value type', 'brand-buddyy' ),
						'type',
						'select',
						array(
							'choices' => array(
								'text' => __( 'Text', 'brand-buddyy' ),
								'html' => __( 'Rich text / HTML', 'brand-buddyy' ),
								'href' => __( 'Link URL', 'brand-buddyy' ),
								'src'  => __( 'Image', 'brand-buddyy' ),
							),
						)
					),
					brand_buddyy_acf_field( 'override_text', __( 'Text or URL value', 'brand-buddyy' ), 'value', 'textarea', array( 'rows' => 3 ) ),
					brand_buddyy_acf_image( 'override_image', __( 'Image value', 'brand-buddyy' ), 'image' ),
				),
			)
		),
	);

	$fields = brand_buddyy_expand_repeaters_for_free_acf( $fields );

	acf_add_local_field_group(
		array(
			'key'                   => 'group_brand_buddyy_homepage',
			'title'                 => __( 'Brand Buddyy — Homepage Content', 'brand-buddyy' ),
			'fields'                => $fields,
			'location'              => array(
				array(
					array(
						'param'    => 'page_type',
						'operator' => '==',
						'value'    => 'front_page',
					),
				),
			),
			'menu_order'            => 0,
			'position'              => 'normal',
			'style'                 => 'seamless',
			'label_placement'       => 'top',
			'instruction_placement' => 'label',
			'hide_on_screen'        => array( 'the_content' ),
			'active'                => true,
		)
	);
}
add_action( 'acf/init', 'brand_buddyy_register_acf_fields' );

/**
 * Populate unsaved homepage fields with the converted site's current copy.
 *
 * This makes the existing content visible in ACF instead of presenting an
 * empty admin form while the frontend uses hidden fallback text.
 *
 * @param mixed  $value   Stored field value.
 * @param int    $post_id Post ID.
 * @param array  $field   ACF field definition.
 * @return mixed
 */
function brand_buddyy_acf_load_defaults( $value, $post_id, $field ) {
	if ( null !== $value && false !== $value ) {
		return $value;
	}

	$defaults = array(
		'header_cta_text' => __( 'Start your project', 'brand-buddyy' ),
		'header_cta_url'  => brand_buddyy_front_page_url( 'contact' ),
		'footer_email'    => 'hello@brandbuddyy.com',
		'contact_recipient_email' => get_option( 'admin_email' ),
		'footer_newsletter_title' => __( 'Useful ideas, occasionally.', 'brand-buddyy' ),
		'footer_newsletter_description' => __( 'Occasional practical insights on websites, automation, advertising and digital growth.', 'brand-buddyy' ),
		'footer_small_print' => __( 'Built with care for useful digital growth.', 'brand-buddyy' ),
		'hero_intro' => __( 'Websites, software, automation and advertising — planned as one growth system.', 'brand-buddyy' ),
		'hero_title' => __( 'Turn your digital presence into a growth engine', 'brand-buddyy' ),
		'hero_card_title' => __( 'Not sure what your business needs first? Let’s find the highest-impact move.', 'brand-buddyy' ),
		'hero_button_text' => __( 'Book a free strategy call', 'brand-buddyy' ),
		'hero_button_url' => brand_buddyy_front_page_url( 'contact' ),
		'hero_guarantee' => __( 'Built for outcomes, not decoration', 'brand-buddyy' ),
		'about_eyebrow' => __( 'Why Brand Buddyy', 'brand-buddyy' ),
		'about_title' => __( 'A digital partner focused on what happens after launch', 'brand-buddyy' ),
		'about_description' => __( 'A polished website is only useful when it supports a stronger business. We combine strategy, conversion-focused design, clean development, automation and advertising so every part of your digital operation moves customers towards action.', 'brand-buddyy' ),
		'about_features' => array(
			array(
				'title'       => __( 'Commercial clarity', 'brand-buddyy' ),
				'description' => __( 'Every decision connects to a business goal, customer need or measurable next action.', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Direct collaboration', 'brand-buddyy' ),
				'description' => __( 'You work closely with the people doing the work, with clear milestones and honest advice.', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Scalable thinking', 'brand-buddyy' ),
				'description' => __( 'We build foundations that can evolve as your offers, team and customer base grow.', 'brand-buddyy' ),
			),
		),
		'capabilities_eyebrow' => __( 'What we bring', 'brand-buddyy' ),
		'capabilities_title' => __( 'Specialists across every stage of digital growth', 'brand-buddyy' ),
		'capabilities' => array(
			array(
				'title'       => __( 'Strategy & Positioning', 'brand-buddyy' ),
				'description' => __( 'Clear offers and customer journeys', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'UX & Visual Design', 'brand-buddyy' ),
				'description' => __( 'Distinctive, conversion-led experiences', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Development & Automation', 'brand-buddyy' ),
				'description' => __( 'Reliable systems built around your workflow', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Advertising & Growth', 'brand-buddyy' ),
				'description' => __( 'Campaigns designed around profitable demand', 'brand-buddyy' ),
			),
		),
		'marquee_text' => __( 'Strategy • Design • Development • Automation • Growth', 'brand-buddyy' ),
		'benefits_eyebrow' => __( 'Why choose us', 'brand-buddyy' ),
		'benefits_title' => __( 'Less digital noise. More useful business progress.', 'brand-buddyy' ),
		'benefits' => array(
			array(
				'title'       => __( 'Ideas grounded in strategy', 'brand-buddyy' ),
				'description' => __( 'Creative thinking starts with your market, offer and customer — not with trends.', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Quality without unnecessary complexity', 'brand-buddyy' ),
				'description' => __( 'Clean design, dependable code and practical systems your team can actually use.', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'A complete growth perspective', 'brand-buddyy' ),
				'description' => __( 'We consider acquisition, conversion and operations together instead of treating them as separate problems.', 'brand-buddyy' ),
			),
		),
		'partners_eyebrow' => __( 'Connected growth', 'brand-buddyy' ),
		'partners_title' => __( 'Your brand, systems and marketing should strengthen each other', 'brand-buddyy' ),
		'services_eyebrow' => __( 'Services', 'brand-buddyy' ),
		'services_title' => __( 'The capabilities required to attract, convert and scale', 'brand-buddyy' ),
		'services_description' => __( 'Choose a focused project or combine services into a complete growth system built around your priorities.', 'brand-buddyy' ),
		'services' => array(
			array(
				'title' => __( 'Websites & Landing Pages', 'brand-buddyy' ),
				'tags'  => "Strategy & UX\nResponsive Design\nConversion Copy\nDevelopment",
				'link'  => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'title' => __( 'Web Apps & Custom Software', 'brand-buddyy' ),
				'tags'  => "Customer Portals\nInternal Tools\nDashboards\nIntegrations",
				'link'  => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'title' => __( 'Automation & Business Systems', 'brand-buddyy' ),
				'tags'  => "Workflow Mapping\nCRM Automation\nLead Routing\nReporting",
				'link'  => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'title' => __( 'Paid Ads & Brand Growth', 'brand-buddyy' ),
				'tags'  => "Campaign Strategy\nCreative Direction\nLead Generation\nOptimisation",
				'link'  => brand_buddyy_front_page_url( 'contact' ),
			),
		),
		'portfolio_eyebrow' => __( 'Solutions', 'brand-buddyy' ),
		'portfolio_title' => __( 'Built around the business problem, not a predefined package', 'brand-buddyy' ),
		'portfolio_description' => __( 'No invented case-study numbers. These are the practical growth systems we can tailor to your business.', 'brand-buddyy' ),
		'portfolio_items' => array(
			array(
				'title'       => __( 'Lead Generation Website', 'brand-buddyy' ),
				'description' => __( 'Positioning, UX, copy and development designed to turn interest into qualified enquiries.', 'brand-buddyy' ),
				'tags'        => "Website\nConversion",
				'link'        => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'title'       => __( 'Customer Web Platform', 'brand-buddyy' ),
				'description' => __( 'A secure, intuitive digital product that gives customers a better way to interact with your business.', 'brand-buddyy' ),
				'tags'        => "Web App\nSoftware",
				'link'        => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'title'       => __( 'Automated Sales Workflow', 'brand-buddyy' ),
				'description' => __( 'Connected forms, CRM, follow-up and reporting that keep leads moving without manual chasing.', 'brand-buddyy' ),
				'tags'        => "Automation\nOperations",
				'link'        => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'title'       => __( 'Performance Campaign System', 'brand-buddyy' ),
				'description' => __( 'Paid media, creative and landing pages built as one measurable acquisition journey.', 'brand-buddyy' ),
				'tags'        => "Advertising\nGrowth",
				'link'        => brand_buddyy_front_page_url( 'contact' ),
			),
		),
		'primary_cta_title' => "Let’s Work\nTogether!",
		'primary_cta_button_text' => __( 'Start your project', 'brand-buddyy' ),
		'primary_cta_button_url' => brand_buddyy_front_page_url( 'contact' ),
		'testimonials_eyebrow' => __( 'What matters', 'brand-buddyy' ),
		'testimonials_title' => __( 'The standards clients should expect from a digital partner', 'brand-buddyy' ),
		'testimonials' => array(
			array(
				'title' => __( 'Clear commercial thinking', 'brand-buddyy' ),
				'quote' => __( 'You should understand why each recommendation matters, what it supports and how success will be assessed.', 'brand-buddyy' ),
				'name'  => __( 'Brand Buddyy principle', 'brand-buddyy' ),
				'role'  => __( 'Strategy', 'brand-buddyy' ),
			),
			array(
				'title' => __( 'Communication without chasing', 'brand-buddyy' ),
				'quote' => __( 'You should always know what is happening, what comes next and where decisions are required.', 'brand-buddyy' ),
				'name'  => __( 'Brand Buddyy principle', 'brand-buddyy' ),
				'role'  => __( 'Collaboration', 'brand-buddyy' ),
			),
			array(
				'title' => __( 'Work built to be used', 'brand-buddyy' ),
				'quote' => __( 'Your team should be able to manage, operate and extend what we create without unnecessary dependence.', 'brand-buddyy' ),
				'name'  => __( 'Brand Buddyy principle', 'brand-buddyy' ),
				'role'  => __( 'Delivery', 'brand-buddyy' ),
			),
			array(
				'title' => __( 'Continuous improvement', 'brand-buddyy' ),
				'quote' => __( 'Launch is the beginning of real learning. We use behaviour and performance to guide the next improvement.', 'brand-buddyy' ),
				'name'  => __( 'Brand Buddyy principle', 'brand-buddyy' ),
				'role'  => __( 'Growth', 'brand-buddyy' ),
			),
		),
		'engagements_eyebrow' => __( 'Ways to work together', 'brand-buddyy' ),
		'engagements_title' => __( 'An engagement shaped around the outcome you need', 'brand-buddyy' ),
		'engagements_description' => __( 'Every scope is priced after we understand the goal, complexity and commercial priority. No inflated bundles and no paying for work you do not need.', 'brand-buddyy' ),
		'engagements' => array(
			array(
				'name'        => __( 'Focused Build', 'brand-buddyy' ),
				'description' => __( 'For a clearly defined website, landing page, automation or product requirement.', 'brand-buddyy' ),
				'price'       => __( 'Fixed scope', 'brand-buddyy' ),
				'features'    => "Discovery and recommendations\nClear deliverables and milestones\nDesign and development\nTesting and launch support\nHandover and documentation\nOptional ongoing optimisation",
				'button_text' => __( 'Request a tailored scope', 'brand-buddyy' ),
				'button_url'  => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'name'        => __( 'Growth System', 'brand-buddyy' ),
				'description' => __( 'For businesses connecting their website, lead generation, advertising and operations.', 'brand-buddyy' ),
				'price'       => __( 'Phased project', 'brand-buddyy' ),
				'features'    => "Commercial and customer journey audit\nWebsite or funnel build\nCRM and workflow automation\nCampaign and creative direction\nMeasurement foundations\nPrioritised improvement roadmap",
				'button_text' => __( 'Request a tailored scope', 'brand-buddyy' ),
				'button_url'  => brand_buddyy_front_page_url( 'contact' ),
			),
			array(
				'name'        => __( 'Ongoing Partner', 'brand-buddyy' ),
				'description' => __( 'For teams that need consistent technical, creative and growth support.', 'brand-buddyy' ),
				'price'       => __( 'Monthly support', 'brand-buddyy' ),
				'features'    => "Planned monthly priorities\nWebsite and software improvements\nAutomation maintenance\nLanding pages and campaign creative\nPerformance reviews\nFlexible specialist support",
				'button_text' => __( 'Request a tailored scope', 'brand-buddyy' ),
				'button_url'  => brand_buddyy_front_page_url( 'contact' ),
			),
		),
		'process_title' => __( 'A clear route from business challenge to working solution', 'brand-buddyy' ),
		'process_steps' => array(
			array(
				'title'       => __( 'Discover & Prioritise', 'brand-buddyy' ),
				'description' => __( 'We clarify your goals, customer journey, constraints and highest-value opportunity.', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Design & Build', 'brand-buddyy' ),
				'description' => __( 'We turn the plan into a focused experience, system or campaign with regular review points.', 'brand-buddyy' ),
			),
			array(
				'title'       => __( 'Launch & Improve', 'brand-buddyy' ),
				'description' => __( 'We test, release and use real performance data to decide what should improve next.', 'brand-buddyy' ),
			),
		),
		'faq_left_title' => __( 'What you can expect from us', 'brand-buddyy' ),
		'faq_title' => __( 'Questions clients ask before starting', 'brand-buddyy' ),
		'faqs' => array(
			array(
				'question' => __( 'What type of businesses do you work with?', 'brand-buddyy' ),
				'answer'   => __( 'We work best with ambitious service businesses, startups and growing teams that need stronger digital foundations, better lead generation or more efficient operations.', 'brand-buddyy' ),
			),
			array(
				'question' => __( 'Can you help us decide what to build first?', 'brand-buddyy' ),
				'answer'   => __( 'Yes. We start by identifying the bottleneck with the greatest commercial impact. You may need a landing page before a full website, or workflow automation before more advertising.', 'brand-buddyy' ),
			),
			array(
				'question' => __( 'How long does a typical project take?', 'brand-buddyy' ),
				'answer'   => __( 'A focused landing page may take a few weeks, while a larger website, platform or automation system takes longer. You receive a realistic timeline after discovery and before committing.', 'brand-buddyy' ),
			),
			array(
				'question' => __( 'Do you provide support after launch?', 'brand-buddyy' ),
				'answer'   => __( 'Yes. We can provide ongoing optimisation, technical support, campaign creative and automation maintenance according to what the project needs.', 'brand-buddyy' ),
			),
			array(
				'question' => __( 'How is a project priced?', 'brand-buddyy' ),
				'answer'   => __( 'Pricing is based on scope, complexity and the outcome required. After an initial conversation, we provide a clear proposal with deliverables, milestones and costs.', 'brand-buddyy' ),
			),
			array(
				'question' => __( 'What do you need from us to begin?', 'brand-buddyy' ),
				'answer'   => __( 'A clear view of your business goals, current challenges, customers and internal decision-makers. We guide the rest through a structured discovery process.', 'brand-buddyy' ),
			),
		),
		'contact_title' => __( 'Ready to solve the next digital bottleneck?', 'brand-buddyy' ),
		'contact_description' => __( 'Book a free, practical conversation about your goals and the clearest next step.', 'brand-buddyy' ),
		'contact_form_title' => __( 'Tell us what you want to improve', 'brand-buddyy' ),
		'insights_eyebrow' => __( 'Useful thinking', 'brand-buddyy' ),
		'insights_title' => __( 'Practical ideas for stronger digital growth decisions', 'brand-buddyy' ),
		'insights_description' => __( 'Clear guidance for businesses planning their next website, system or campaign.', 'brand-buddyy' ),
	);

	if ( array_key_exists( $field['name'], $defaults ) ) {
		return $defaults[ $field['name'] ];
	}

	if ( preg_match( '/^(.+)_([1-9][0-9]*)_(.+)$/', $field['name'], $matches ) ) {
		$parent = $matches[1];
		$index  = (int) $matches[2] - 1;
		$child  = $matches[3];

		if (
			isset( $defaults[ $parent ] ) &&
			is_array( $defaults[ $parent ] ) &&
			isset( $defaults[ $parent ][ $index ] ) &&
			is_array( $defaults[ $parent ][ $index ] ) &&
			array_key_exists( $child, $defaults[ $parent ][ $index ] )
		) {
			return $defaults[ $parent ][ $index ][ $child ];
		}
	}

	return $value;
}
add_filter( 'acf/load_value', 'brand_buddyy_acf_load_defaults', 10, 3 );

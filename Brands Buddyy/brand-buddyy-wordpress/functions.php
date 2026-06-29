<?php
/**
 * Brand Buddyy theme bootstrap.
 *
 * @package Brand_Buddyy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BRAND_BUDDYY_VERSION', '1.0.0' );
define( 'BRAND_BUDDYY_PATH', get_template_directory() );
define( 'BRAND_BUDDYY_URI', get_template_directory_uri() );

require_once BRAND_BUDDYY_PATH . '/inc/helpers.php';
require_once BRAND_BUDDYY_PATH . '/inc/theme-setup.php';
require_once BRAND_BUDDYY_PATH . '/inc/enqueue.php';
require_once BRAND_BUDDYY_PATH . '/inc/acf-fields.php';
